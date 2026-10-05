import { describe, expect, test } from 'bun:test';
import { alxia } from './alxia';

/**
 * Every path the app accepts is one `Bun.serve` accepts at `listen` and
 * matches as `fetch` does: each case through `app.request` and through a
 * real server, which must answer alike. `requests` maps what is asked to
 * the route that answers it, `null` for none. Measured on Bun 1.4.2.
 */
const cases: {
	readonly path: string;
	readonly requests: Readonly<Record<string, string | null>>;
}[] = [
	// A client encodes what the URL encodes, so `/café` reaches it.
	{
		path: '/caf%C3%A9',
		requests: { '/caf%C3%A9': '/caf%C3%A9', '/café': '/caf%C3%A9' },
	},
	// Escapes are compared as sent, case and all.
	{
		path: '/caf%c3%a9',
		requests: { '/caf%c3%a9': '/caf%c3%a9', '/café': null },
	},
	{ path: '/a%20b', requests: { '/a%20b': '/a%20b', '/a b': '/a%20b' } },
	{ path: '/%41', requests: { '/%41': '/%41', '/A': null } },
	{ path: '/100%', requests: { '/100%': '/100%', '/100%25': null } },
	{ path: '/%zz', requests: { '/%zz': '/%zz' } },
	{ path: '/a|b', requests: { '/a|b': '/a|b' } },
	{ path: "/a'b~c", requests: { "/a'b~c": "/a'b~c" } },
	{ path: '/.well-known/x', requests: { '/.well-known/x': '/.well-known/x' } },
	{ path: '/a..b', requests: { '/a..b': '/a..b' } },
	{ path: '/a//b', requests: { '/a//b': '/a//b', '/a/b': null } },
	{ path: '/at/:time', requests: { '/at/10:30': '/at/:time' } },
	{ path: '/f/*', requests: { '/f/a/../b': '/f/*', '/f/../b': null } },
];

async function answer(response: Response) {
	return { status: response.status, body: await response.text() };
}

describe('a path the app accepts', () => {
	for (const { path, requests } of cases) {
		test(`${path} routes alike through fetch and listen`, async () => {
			const app = alxia().get(path as '/', ({ params, reply }) =>
				reply(200, { route: path, params }),
			);
			const server = app.listen({ port: 0 });
			try {
				for (const [url, route] of Object.entries(requests)) {
					const viaFetch = await answer(await app.request(url));
					const viaListen = await answer(await fetch(new URL(url, server.url)));
					expect({ url, ...viaFetch }).toEqual({ url, ...viaListen });
					const chosen =
						viaFetch.status === 200 ? JSON.parse(viaFetch.body).route : null;
					expect({ url, route: chosen }).toEqual({ url, route });
				}
			} finally {
				await app.stop(true);
			}
		});
	}
});

describe('a path the app refuses', () => {
	const refused: Readonly<Record<string, string>> = {
		'/at/10:30': '"/at/10:30": ":" may only start a segment, as a parameter',
		'/*a': '"/*a": "*" may only be a whole segment, as a wildcard',
		'/a/./b': `"/a/./b": "." is a dot segment, which a request's URL never keeps`,
		'/café': `"/café" is not encoded as a request's URL carries it: declare "/caf%C3%A9"`,
	};

	for (const [path, message] of Object.entries(refused)) {
		test(`${path} throws when declared, by route, page and socket`, async () => {
			expect(() =>
				alxia().get(path as '/', ({ reply }) => reply(200, 'x')),
			).toThrow(new TypeError(message));
			expect(() => alxia().ws(path as '/', {}, { message: () => {} })).toThrow(
				new TypeError(message),
			);
			const bundle = (await import('../../test/fixtures/page.html')).default;
			expect(() => alxia().page(path as '/', bundle)).toThrow(
				new TypeError(message),
			);
		});
	}

	test('under a prefix too', () => {
		expect(() =>
			// @ts-expect-error: refused by its type too, the prefix and all
			alxia({ prefix: '/api' }).get('/at/10:30', ({ reply }) =>
				reply(200, 'x'),
			),
		).toThrow('"/api/at/10:30": ":" may only start a segment');
	});

	// Why: given these, `Bun.serve` throws at `listen`. When it stops
	// throwing, the refusal may be worth revisiting.
	test('Bun.serve itself throws on a `:` before a digit and on non-ASCII', () => {
		for (const [path, message] of [
			['/at/10:30', 'Route parameter names cannot start with a number'],
			['/café', 'Please encode all non-ASCII characters'],
		] as const) {
			expect(() =>
				Bun.serve({
					port: 0,
					routes: { [path]: () => new Response('x') },
					fetch: () => new Response('x'),
				}),
			).toThrow(message);
		}
	});
});

/** `target` sent as it is, which `fetch` would resolve first: `/f/../a`. */
async function raw(port: number, target: string) {
	const { promise, resolve, reject } = Promise.withResolvers<string>();
	let data = '';
	await Bun.connect({
		hostname: '127.0.0.1',
		port,
		socket: {
			open(socket) {
				socket.write(
					`GET ${target} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`,
				);
			},
			data(_socket, chunk) {
				data += chunk.toString();
			},
			close() {
				resolve(data);
			},
			error(_socket, error) {
				reject(error);
			},
		},
	});
	const answered = await promise;
	const [head = '', body = ''] = answered.split('\r\n\r\n');
	return { status: Number(head.split(' ')[1]), body };
}

describe('a target Bun.serve would route otherwise than its URL', () => {
	test('is routed by its URL, as fetch routes it', async () => {
		const app = alxia()
			.get('/', ({ reply }) => reply(200, 'root'))
			.get('/a', ({ reply }) => reply(200, 'a'))
			.get('/f/x', ({ reply }) => reply(200, 'f/x'))
			.get('/f/*', ({ reply }) => reply(200, 'f/*'))
			.get('/u/:id', ({ params, reply }) => reply(200, `u ${params.id}`));
		const server = app.listen({ port: 0 });
		try {
			// Bun's router alone takes the first to `/f/*`, the second to
			// `/u/:id` with no `id`, the third to `/f/*`.
			for (const [target, body] of [
				['/f/../a', 'a'],
				['/u/..', 'root'],
				['/f/./x', 'f/x'],
				['/f/%2e%2e/a', 'a'],
				['/./a', 'a'],
				['/u/./7', 'u 7'],
			] as const) {
				const viaFetch = await answer(await app.request(target));
				expect({ target, ...viaFetch }).toEqual({ target, status: 200, body });
				expect({
					target,
					...(await raw(server.port as number, target)),
				}).toEqual({
					target,
					status: 200,
					body,
				});
			}
		} finally {
			await app.stop(true);
		}
	});
});
