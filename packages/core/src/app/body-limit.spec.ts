import { afterEach, describe, expect, test } from 'bun:test';
import { z } from 'zod';
import type { Refusal } from '../errors/errors';
import { problem } from '../reply/problem';
import { type AnyAlxia, alxia } from './alxia';

const tooLarge = (limit: number) => ({ error: 'content_too_large', limit });

/** A body of `total` bytes sent in `chunk`-byte pieces, with no `Content-Length`, counting what was pulled. */
function chunked(total: number, chunk = 64 * 1024) {
	const piece = new Uint8Array(chunk).fill(97);
	const sent = { bytes: 0 };
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			const left = total - sent.bytes;
			if (left <= 0) return controller.close();
			const next = left < chunk ? piece.subarray(0, left) : piece;
			sent.bytes += next.byteLength;
			controller.enqueue(next);
		},
	});
	return { body, sent };
}

const post = (body: BodyInit, type = 'text/plain'): RequestInit =>
	({
		method: 'POST',
		body,
		headers: { 'content-type': type },
		duplex: 'half',
	}) as RequestInit;

describe('bodyLimit on a route', () => {
	const app = alxia().post(
		'/notes',
		{ body: z.string(), bodyLimit: 8 },
		({ body, reply }) => reply(200, body),
	);

	test('a body under the limit, or exactly at it, is read', async () => {
		const under = await app.request('/notes', post('1234567'));
		expect(under.status).toBe(200);
		expect(await under.text()).toBe('1234567');
		const at = await app.request('/notes', post('12345678'));
		expect(at.status).toBe(200);
		expect(await at.text()).toBe('12345678');
	});

	test('a Content-Length over the limit is a 413, the body unread', async () => {
		const { body, sent } = chunked(1024, 16);
		const response = await app.request('/notes', {
			...post(body),
			headers: { 'content-type': 'text/plain', 'content-length': '1024' },
		});
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual(tooLarge(8));
		// A stream pulls its first chunk as it is made; nothing past it is read.
		expect(sent.bytes).toBeLessThanOrEqual(16);
	});

	test('a body one byte over the limit, with no Content-Length, is a 413', async () => {
		const { body } = chunked(9, 4);
		const response = await app.request('/notes', post(body));
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual(tooLarge(8));
	});

	test('a chunked body over the limit stops being read once it passes it', async () => {
		const limit = 1024 * 1024;
		const big = alxia().post(
			'/big',
			{ body: z.string(), bodyLimit: limit },
			({ reply }) => reply(200, 'read'),
		);
		const { body, sent } = chunked(64 * 1024 * 1024);
		const response = await big.request('/big', post(body));
		expect(response.status).toBe(413);
		// Measured: 1 MiB + one 64 KiB chunk past it, of the 64 MiB offered.
		expect(sent.bytes).toBeLessThan(limit + 4 * 64 * 1024);
	});

	test('JSON, forms and a custom parser are bounded alike', async () => {
		const parsed = alxia()
			.parser('application/x-ndjson', async (request) =>
				(await request.text()).split('\n'),
			)
			.bodyLimit(16)
			.post('/json', { body: z.unknown() }, ({ reply }) => reply(200, 'ok'))
			.post('/form', { body: z.unknown() }, ({ reply }) => reply(200, 'ok'))
			.post('/ndjson', { body: z.unknown() }, ({ reply }) => reply(200, 'ok'));
		const json = JSON.stringify({ text: 'x'.repeat(32) });
		const form = new URLSearchParams({ text: 'x'.repeat(32) }).toString();
		for (const [path, body, type] of [
			['/json', json, 'application/json'],
			['/form', form, 'application/x-www-form-urlencoded'],
			['/ndjson', 'a\nb\nc\nd\ne\nf\ng\nh\ni', 'application/x-ndjson'],
		] as const) {
			const sized = await parsed.request(path, post(body, type));
			expect(sized.status).toBe(413);
			const { body: stream } = chunked(body.length, 4);
			const streamed = await parsed.request(path, post(stream, type));
			expect(streamed.status).toBe(413);
			expect(await streamed.json()).toEqual(tooLarge(16));
		}
		const small = await parsed.request('/json', post('{}', 'application/json'));
		expect(small.status).toBe(200);
	});

	test('a handler reading the raw stream is bounded too', async () => {
		const raw = alxia().post(
			'/upload',
			{ bodyLimit: 10 },
			async ({ request, reply }) => {
				let bytes = 0;
				for await (const chunk of request.body ?? []) bytes += chunk.byteLength;
				return reply(200, bytes);
			},
		);
		const under = await raw.request('/upload', post(chunked(10, 3).body));
		expect(await under.json()).toBe(10);
		const over = await raw.request('/upload', post(chunked(11, 3).body));
		expect(over.status).toBe(413);
		expect(await over.json()).toEqual(tooLarge(10));
	});

	test('the refusal reaches onRefusal, never the onError hooks', async () => {
		const errors: unknown[] = [];
		const app = alxia()
			.onError((error) => {
				errors.push(error);
				return undefined;
			})
			.post('/api', { body: z.unknown(), bodyLimit: 2 }, ({ reply }) =>
				reply(200, 'ok'),
			);
		const response = await app.request(
			'/api',
			post('[1, 2]', 'application/json'),
		);
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual(tooLarge(2));
		expect(errors).toEqual([]);
	});

	test('a body a global hook already read is left as it is', async () => {
		const read = alxia()
			.onRequest(async ({ request }) => {
				await request.text();
			})
			.post('/x', { bodyLimit: 100 }, ({ reply }) => reply(200, 'ok'));
		const response = await read.request('/x', post('12345'));
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('ok');
	});

	test('a limit that is not a number is a compile error', () => {
		const app = alxia();
		expect(() =>
			// @ts-expect-error: bodyLimit is a number of bytes
			app.post('/a', { bodyLimit: '1mb' }, ({ reply }) => reply(200, 'a')),
		).toThrow(TypeError);
		// @ts-expect-error: bodyLimit() takes a number of bytes
		expect(() => app.bodyLimit('1mb')).toThrow(TypeError);
	});

	test('a limit that is not a whole number of bytes is refused', () => {
		expect(() =>
			alxia().post('/a', { bodyLimit: -1 }, ({ reply }) => reply(200, 'a')),
		).toThrow('POST /a: bodyLimit must be a whole number of bytes');
		expect(() => alxia().bodyLimit(1.5)).toThrow(
			'bodyLimit(): bodyLimit must be a whole number of bytes',
		);
	});
});

describe('without a bodyLimit', () => {
	test('nothing changes: the request is the one received, and its type has no 413', async () => {
		let seen: Request | undefined;
		const app = alxia()
			.derive(({ request }) => {
				seen = request;
				return {};
			})
			.post('/notes', { body: z.string() }, ({ body, reply }) =>
				reply(200, body.length),
			);
		const request = new Request(
			'http://localhost/notes',
			post('x'.repeat(4096)),
		);
		const response = await app.fetch(request);
		expect(await response.json()).toBe(4096);
		expect(seen).toBe(request);
	});
});

describe('bodyLimit() for the routes after it', () => {
	const app = alxia()
		.post('/before', { body: z.string() }, ({ reply }) => reply(200, 'ok'))
		.bodyLimit(4)
		.post('/after', { body: z.string() }, ({ reply }) => reply(200, 'ok'))
		.post('/own', { body: z.string(), bodyLimit: 16 }, ({ reply }) =>
			reply(200, 'ok'),
		)
		.group('/admin', (admin) =>
			admin
				.post('/inherits', { body: z.string() }, ({ reply }) =>
					reply(200, 'ok'),
				)
				.bodyLimit(2)
				.post('/tighter', { body: z.string() }, ({ reply }) =>
					reply(200, 'ok'),
				),
		)
		.post('/outside', { body: z.string() }, ({ reply }) => reply(200, 'ok'));

	const status = async (path: string, body: string) =>
		(await app.request(path, post(body))).status;

	test('a route declared before it has no limit', async () => {
		expect(await status('/before', 'x'.repeat(1024))).toBe(200);
	});

	test('a route after it takes it, unless its own says otherwise', async () => {
		expect(await status('/after', 'xxxx')).toBe(200);
		expect(await status('/after', 'xxxxx')).toBe(413);
		expect(await status('/own', 'x'.repeat(16))).toBe(200);
		expect(await status('/own', 'x'.repeat(17))).toBe(413);
	});

	test('a group inherits it, and keeps its own inside', async () => {
		expect(await status('/admin/inherits', 'xxxx')).toBe(200);
		expect(await status('/admin/inherits', 'xxxxx')).toBe(413);
		expect(await status('/admin/tighter', 'xxx')).toBe(413);
		expect(await status('/outside', 'xxx')).toBe(200);
	});

	test("a plugin's routes keep their own limit, the app's bodyLimit() never reaching them", async () => {
		const plugin = alxia()
			.post('/free', { body: z.string() }, ({ reply }) => reply(200, 'ok'))
			.post('/own', { body: z.string(), bodyLimit: 8 }, ({ reply }) =>
				reply(200, 'ok'),
			);
		const host = alxia().bodyLimit(4).plugin(plugin);
		expect((await host.request('/free', post('xxxxx'))).status).toBe(200);
		expect((await host.request('/own', post('xxxxxxxx'))).status).toBe(200);
		expect((await host.request('/own', post('xxxxxxxxx'))).status).toBe(413);
		expect(host.routes.map((route) => route.bodyLimit)).toEqual([undefined, 8]);
	});

	test("a plugin's own bodyLimit() applies to the app's routes after use", async () => {
		const host = alxia()
			.plugin(alxia().bodyLimit(4))
			.post('/after', { body: z.string() }, ({ reply }) => reply(200, 'ok'));
		expect((await host.request('/after', post('xxxx'))).status).toBe(200);
		expect((await host.request('/after', post('xxxxx'))).status).toBe(413);
		expect(host.routes[0]?.bodyLimit).toBe(4);
	});
});

describe('bodyLimit under listen', () => {
	let app: AnyAlxia | undefined;
	afterEach(async () => {
		await app?.stop(true);
		app = undefined;
	});

	test('a Content-Length over it, and a body at it', async () => {
		app = alxia().post(
			'/notes',
			{ body: z.string(), bodyLimit: 8 },
			({ body, reply }) => reply(200, body),
		);
		const server = app.listen(0);
		const over = await fetch(
			new URL('/notes', server.url),
			post('x'.repeat(4096)),
		);
		expect(over.status).toBe(413);
		expect(await over.json()).toEqual(tooLarge(8));
		const at = await fetch(new URL('/notes', server.url), post('12345678'));
		expect(await at.text()).toBe('12345678');
	});

	test('a raw upload streamed past 25 MiB is cut off there, its memory flat', async () => {
		const limit = 25 * 1024 * 1024;
		let counted = 0;
		app = alxia().post(
			'/upload',
			{ bodyLimit: limit },
			async ({ request, reply }) => {
				for await (const chunk of request.body ?? [])
					counted += chunk.byteLength;
				return reply(200, counted);
			},
		);
		const server = app.listen({
			port: 0,
			maxRequestBodySize: 1024 * 1024 * 1024,
		});
		const url = new URL('/upload', server.url);

		const exact = chunked(limit);
		expect(await (await fetch(url, post(exact.body))).json()).toBe(limit);

		counted = 0;
		Bun.gc(true);
		const before = process.memoryUsage().rss;
		const offered = 256 * 1024 * 1024;
		const over = chunked(offered);
		const response = await fetch(url, post(over.body));
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual(tooLarge(limit));
		const grown = process.memoryUsage().rss - before;
		// Measured: the handler counted 25 MiB, the client was pulled
		// 25.3 MiB of the 256 MiB offered, and the process grew by 2 MiB.
		expect(counted).toBeLessThanOrEqual(limit);
		expect(over.sent.bytes).toBeLessThan(limit + 8 * 1024 * 1024);
		expect(grown).toBeLessThan(limit);
	});
});

/** JMAP's answer to a request too large, and a 400 for one its schemas refuse. */
const jmapLimit = (refusal: Refusal) =>
	refusal.kind === 'body_limit'
		? problem({
				type: 'urn:ietf:params:jmap:error:limit',
				status: 413,
				limit: 'maxSizeRequest',
			})
		: problem({
				type: 'urn:ietf:params:jmap:error:notRequest',
				status: 400,
				detail: `the ${refusal.part} is invalid`,
			});

const JMAP_LIMIT = {
	type: 'urn:ietf:params:jmap:error:limit',
	status: 413,
	limit: 'maxSizeRequest',
};

/** An app whose refusals are JMAP problems: a JSON route and a raw upload, both limited, and one without a limit. */
function jmapApp() {
	return alxia()
		.onRefusal(jmapLimit)
		.post('/api', { body: z.unknown(), bodyLimit: 16 }, ({ reply }) =>
			reply(200, 'ok'),
		)
		.post('/upload', { bodyLimit: 16 }, async ({ request, reply }) => {
			let bytes = 0;
			for await (const chunk of request.body ?? []) bytes += chunk.byteLength;
			return reply(200, bytes);
		})
		.post('/free', { body: z.unknown() }, ({ reply }) => reply(200, 'ok'));
}

describe('a body_limit refusal through onRefusal', () => {
	let listening: AnyAlxia | undefined;
	afterEach(async () => {
		await listening?.stop(true);
		listening = undefined;
	});

	const transports = {
		'app.request': () => {
			const app = jmapApp();
			return (path: string, init: RequestInit) => app.request(path, init);
		},
		listen: () => {
			const app = jmapApp();
			listening = app;
			const server = app.listen(0);
			return (path: string, init: RequestInit) =>
				fetch(new URL(path, server.url), init);
		},
	};

	for (const [name, open] of Object.entries(transports)) {
		test(`JMAP's 413, by problem(), on a JSON route and a raw stream, under ${name}`, async () => {
			const call = open();
			const big = JSON.stringify({ text: 'x'.repeat(64) });
			for (const path of ['/api', '/upload']) {
				const sized = await call(path, post(big, 'application/json'));
				expect(sized.status).toBe(413);
				expect(sized.headers.get('content-type')).toBe(
					'application/problem+json',
				);
				expect(await sized.json()).toEqual(JMAP_LIMIT);
				const streamed = await call(
					path,
					post(chunked(64, 8).body, 'application/json'),
				);
				expect(streamed.status).toBe(413);
				expect(await streamed.json()).toEqual(JMAP_LIMIT);
			}
			const fits = await call('/upload', post(chunked(16, 4).body));
			expect(await fits.json()).toBe(16);
			const invalid = await call('/api', post('{', 'application/json'));
			expect(invalid.status).toBe(400);
		});
	}

	test('a hook that returns nothing for body_limit leaves the default 413', async () => {
		const kinds: string[] = [];
		const app = alxia()
			.onRefusal((refusal) => {
				kinds.push(refusal.kind);
				return refusal.kind === 'validation'
					? problem({ status: 422, detail: refusal.part })
					: undefined;
			})
			.post('/api', { body: z.string(), bodyLimit: 4 }, ({ reply }) =>
				reply(200, 'ok'),
			);
		const response = await app.request('/api', post('12345'));
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual(tooLarge(4));
		expect(kinds).toEqual(['body_limit']);
	});

	test("the app's hook answers the 413 of a plugin's limited route without a hook", async () => {
		const plugin = alxia().post(
			'/p',
			{ body: z.string(), bodyLimit: 4 },
			({ reply }) => reply(200, 'ok'),
		);
		const app = alxia().onRefusal(jmapLimit).plugin(plugin);
		const response = await app.request('/p', post('12345'));
		expect(await response.json()).toEqual(JMAP_LIMIT);
	});

	test("a plugin's own hook answers its 413 behind the app's hook", async () => {
		const plugin = alxia()
			.onRefusal((refusal) =>
				refusal.kind === 'body_limit'
					? problem({ status: 413, detail: 'plugin' })
					: undefined,
			)
			.post('/p', { bodyLimit: 4 }, async ({ request, reply }) =>
				reply(200, (await request.text()).length),
			);
		const app = alxia().onRefusal(jmapLimit).bodyLimit(4).plugin(plugin);
		const response = await app.request('/p', post('12345678'));
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual({ status: 413, detail: 'plugin' });
	});

	test('a hook that throws on a body_limit is a 500', async () => {
		const app = alxia()
			.onRefusal(() => {
				throw new Error('the hook failed');
			})
			.post('/api', { bodyLimit: 1 }, async ({ request, reply }) =>
				reply(200, await request.text()),
			);
		const error = console.error;
		console.error = () => {};
		try {
			const response = await app.request('/api', post('12'));
			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({ error: 'internal' });
		} finally {
			console.error = error;
		}
	});

	test('a refusal is narrowed by kind before its fields are read', () => {
		alxia().onRefusal((refusal) => {
			// @ts-expect-error: a body_limit refusal has no part
			refusal.part;
			return undefined;
		});
	});
});
