import { describe, expect, expectTypeOf, test } from 'bun:test';
import { z } from 'zod';
import type {
	BodyLimitRefusal,
	ContentTooLargeBody,
	RequestPart,
	ValidationErrorBody,
	ValidationRefusal,
} from '../errors/errors';
import { problem } from '../reply/problem';
import type { Jsonify } from '../types/json';
import { alxia, type RoutesOf } from './alxia';

const Name = z.object({ name: z.string().min(1) });
const Invalid = z.object({ detail: z.string() });
const TooLarge = z.object({ limit: z.number() });

const post = (body: string): RequestInit => ({
	method: 'POST',
	headers: { 'content-type': 'application/json' },
	body,
});
/** A body its schema refuses, and one past a limit of 32 bytes. */
const INVALID = post('{"name":""}');
const LARGE = post(JSON.stringify({ name: 'x'.repeat(64) }));

/** A route that validates its body and has a limit: it may be refused with either kind. */
const both = { body: Name, bodyLimit: 32 } as const;

describe('onRefusal(kind, hook): at runtime', () => {
	test('each kind is answered by its own hook, its schemas checking its reply and its content type set', async () => {
		const app = alxia()
			.onRefusal(
				'validation',
				{ response: { 422: Invalid }, contentType: 'application/problem+json' },
				(refusal, { reply }) =>
					reply(422, { detail: `the ${refusal.part} is invalid` }),
			)
			.onRefusal(
				'body_limit',
				{ response: { 413: TooLarge } },
				(refusal, { reply }) => reply(413, { limit: refusal.limit }),
			)
			.post('/a', both, ({ reply }) => reply(200, 'ok'));
		const invalid = await app.request('/a', INVALID);
		expect(invalid.status).toBe(422);
		expect(invalid.headers.get('content-type')).toBe(
			'application/problem+json',
		);
		expect(await invalid.json()).toEqual({ detail: 'the body is invalid' });
		const large = await app.request('/a', LARGE);
		expect(large.status).toBe(413);
		expect(large.headers.get('content-type')).toContain('application/json');
		expect(await large.json()).toEqual({ limit: 32 });
	});

	test('a kind without a hook falls back to the general hook, then to the default', async () => {
		const general = alxia()
			.onRefusal(() => problem({ status: 400, detail: 'general' }))
			.onRefusal('validation', () => problem({ status: 422, detail: 'kind' }))
			.post('/a', both, ({ reply }) => reply(200, 'ok'));
		expect(await (await general.request('/a', INVALID)).json()).toEqual({
			status: 422,
			detail: 'kind',
		});
		expect(await (await general.request('/a', LARGE)).json()).toEqual({
			status: 400,
			detail: 'general',
		});
		const none = alxia()
			.onRefusal('validation', () => problem({ status: 422 }))
			.post('/a', both, ({ reply }) => reply(200, 'ok'));
		const large = await none.request('/a', LARGE);
		expect(large.status).toBe(413);
		expect(await large.json()).toEqual({
			error: 'content_too_large',
			limit: 32,
		});
	});

	test('a kind hook that returns nothing falls back to the general hook, then to the default', async () => {
		const seen: string[] = [];
		const app = alxia()
			.onRefusal((refusal) => {
				seen.push(`general ${refusal.kind}`);
				return undefined;
			})
			.onRefusal('validation', (refusal) => {
				seen.push(`kind ${refusal.part}`);
				return refusal.part === 'query' ? problem({ status: 422 }) : undefined;
			})
			.post('/a', both, ({ reply }) => reply(200, 'ok'));
		const response = await app.request('/a', INVALID);
		expect(response.status).toBe(400);
		expect(((await response.json()) as ValidationErrorBody).error).toBe(
			'validation',
		);
		expect(seen).toEqual(['kind body', 'general validation']);
	});

	test('order is meaning: a later general hook replaces a kind hook, a later one of the same kind too', async () => {
		const replaced = alxia()
			.onRefusal('validation', () => problem({ status: 422 }))
			.onRefusal(() => problem({ status: 400, detail: 'general' }))
			.post('/a', both, ({ reply }) => reply(200, 'ok'));
		expect((await replaced.request('/a', INVALID)).status).toBe(400);
		const twice = alxia()
			.onRefusal('validation', () => problem({ status: 422 }))
			.onRefusal('validation', () => problem({ status: 409 }))
			.post('/a', both, ({ reply }) => reply(200, 'ok'));
		expect((await twice.request('/a', INVALID)).status).toBe(409);
	});

	test("a group's kind hook stays inside it", async () => {
		const app = alxia()
			.group('/g', (group) =>
				group
					.onRefusal('validation', () => problem({ status: 422 }))
					.post('/a', both, ({ reply }) => reply(200, 'ok')),
			)
			.post('/a', both, ({ reply }) => reply(200, 'ok'));
		expect((await app.request('/g/a', INVALID)).status).toBe(422);
		expect((await app.request('/a', INVALID)).status).toBe(400);
	});

	test("a plugin's route: its own hooks first, then the app's of that kind, then the app's general hook", async () => {
		const seen: string[] = [];
		const plugin = alxia()
			.onRefusal('validation', () => {
				seen.push('plugin validation');
				return undefined;
			})
			.post('/p', both, ({ reply }) => reply(200, 'ok'));
		const app = alxia()
			.onRefusal(() => problem({ status: 400, detail: 'app' }))
			.onRefusal('validation', () => {
				seen.push('app validation');
				return undefined;
			})
			.use(plugin);
		const invalid = await app.request('/p', INVALID);
		expect(await invalid.json()).toEqual({ status: 400, detail: 'app' });
		expect(seen).toEqual(['plugin validation', 'app validation']);
		expect(await (await app.request('/p', LARGE)).json()).toEqual({
			status: 400,
			detail: 'app',
		});
	});

	test("a plugin's general hook answers every kind of its routes, the app's hooks never", async () => {
		const plugin = alxia()
			.onRefusal(() => undefined)
			.post('/p', both, ({ reply }) => reply(200, 'ok'));
		const app = alxia()
			.onRefusal('validation', () => problem({ status: 422 }))
			.use(plugin);
		expect((await app.request('/p', INVALID)).status).toBe(400);
	});

	test("a plugin's kind hook applies to the app's routes after it, the app's general hook kept", async () => {
		const plugin = alxia().onRefusal('body_limit', () =>
			problem({ status: 413, detail: 'plugin' }),
		);
		const app = alxia()
			.onRefusal(() => problem({ status: 400, detail: 'app' }))
			.use(plugin)
			.post('/a', both, ({ reply }) => reply(200, 'ok'));
		expect(await (await app.request('/a', LARGE)).json()).toEqual({
			status: 413,
			detail: 'plugin',
		});
		expect(await (await app.request('/a', INVALID)).json()).toEqual({
			status: 400,
			detail: 'app',
		});
	});

	test('a socket route: its upgrade refused, answered by the hook of the validation kind', async () => {
		const app = alxia()
			.onRefusal('validation', (refusal) =>
				problem({ status: 422, detail: refusal.part }),
			)
			.ws(
				'/ws',
				{ query: z.object({ room: z.string() }) },
				{ message: () => {} },
			);
		const response = await app.request('/ws', {
			headers: { upgrade: 'websocket' },
		});
		expect(response.status).toBe(422);
		expect(await response.json()).toEqual({ status: 422, detail: 'query' });
	});

	test('a reply its schemas do not declare is a 500, as for the general hook', async () => {
		const app = alxia()
			.onRefusal(
				'validation',
				{ response: { 422: Invalid } },
				(_refusal, { reply }) => reply(422, { detail: 1 } as never),
			)
			.post('/a', both, ({ reply }) => reply(200, 'ok'));
		const error = console.error;
		console.error = () => {};
		try {
			expect((await app.request('/a', INVALID)).status).toBe(500);
		} finally {
			console.error = error;
		}
	});

	test('an unknown kind, or a missing hook, is refused when declared', () => {
		expect(() =>
			alxia().onRefusal('timeout' as never, () => undefined),
		).toThrow(
			`onRefusal(): "timeout" is no kind of refusal; expected 'validation' or 'body_limit'`,
		);
		expect(() =>
			alxia().onRefusal('validation', { response: {} } as never),
		).toThrow('onRefusal(): the hook is missing');
	});
});

describe('onRefusal(kind, hook): in the types', () => {
	test('each hook reads its refusal narrowed', () => {
		alxia()
			.onRefusal('validation', (refusal) => {
				expectTypeOf(refusal).toEqualTypeOf<ValidationRefusal>();
				expectTypeOf(refusal.part).toEqualTypeOf<RequestPart>();
				return undefined;
			})
			.onRefusal('body_limit', (refusal) => {
				expectTypeOf(refusal).toEqualTypeOf<BodyLimitRefusal>();
				// @ts-expect-error: a body_limit refusal has no part
				refusal.part;
				return undefined;
			});
	});

	test('each kind replaces its own default in the route types, with the schemas of its hook', () => {
		const app = alxia()
			.onRefusal(
				'validation',
				{ response: { 422: Invalid } },
				(refusal, { reply }) => reply(422, { detail: refusal.part }),
			)
			.onRefusal(
				'body_limit',
				{ response: { 413: TooLarge } },
				(refusal, { reply }) => reply(413, { limit: refusal.limit }),
			)
			.post('/both', both, ({ reply }) => reply(200, 'ok'))
			.post('/valid', { body: Name }, ({ reply }) => reply(200, 'ok'))
			.post('/raw', { bodyLimit: 8 }, ({ reply }) => reply(200, 'ok'))
			.get('/plain', ({ reply }) => reply(200, 'ok'));
		type Routes = RoutesOf<typeof app>;
		type Both = Routes['/both']['POST']['output'];
		expectTypeOf<Both['status']>().toEqualTypeOf<200 | 413 | 422 | 500>();
		expectTypeOf<Extract<Both, { status: 422 }>['data']>().toEqualTypeOf<{
			detail: string;
		}>();
		expectTypeOf<Extract<Both, { status: 413 }>['data']>().toEqualTypeOf<{
			limit: number;
		}>();
		// Per kind: a route that only validates gets the validation hook's replies alone…
		expectTypeOf<Routes['/valid']['POST']['output']['status']>().toEqualTypeOf<
			200 | 422 | 500
		>();
		// …and a route that is only limited the body_limit hook's.
		expectTypeOf<Routes['/raw']['POST']['output']['status']>().toEqualTypeOf<
			200 | 413 | 500
		>();
		expectTypeOf<Routes['/plain']['GET']['output']['status']>().toEqualTypeOf<
			200 | 500
		>();
	});

	test('a kind without a hook, or whose hook may return nothing, gets the general hook, then the default', () => {
		const general = alxia()
			.onRefusal(() => problem({ status: 400, detail: 'general' }))
			.onRefusal('validation', (refusal) =>
				refusal.part === 'body' ? problem({ status: 422 }) : undefined,
			)
			.post('/a', both, ({ reply }) => reply(200, 'ok'));
		type A = RoutesOf<typeof general>['/a']['POST']['output'];
		expectTypeOf<A['status']>().toEqualTypeOf<200 | 400 | 422 | 500>();
		expectTypeOf<Extract<A, { status: 400 }>['data']>().toEqualTypeOf<{
			status: 400;
			detail: 'general';
		}>();
		const none = alxia()
			.onRefusal('validation', () => problem({ status: 422 }))
			.post('/a', both, ({ reply }) => reply(200, 'ok'));
		type N = RoutesOf<typeof none>['/a']['POST']['output'];
		expectTypeOf<N['status']>().toEqualTypeOf<200 | 413 | 422 | 500>();
		expectTypeOf<Extract<N, { status: 413 }>['data']>().toEqualTypeOf<
			Jsonify<ContentTooLargeBody>
		>();
		const maybe = alxia()
			.onRefusal('body_limit', (refusal) =>
				refusal.limit > 4 ? undefined : problem({ status: 413 }),
			)
			.post('/a', both, ({ reply }) => reply(200, 'ok'));
		type M = RoutesOf<typeof maybe>['/a']['POST']['output'];
		expectTypeOf<Extract<M, { status: 413 }>['data']>().toEqualTypeOf<
			{ status: 413 } | Jsonify<ContentTooLargeBody>
		>();
	});

	test('order is meaning in the types too', () => {
		const replaced = alxia()
			.onRefusal('validation', () => problem({ status: 422 }))
			.onRefusal(() => problem({ status: 409 }))
			.post('/a', { body: Name }, ({ reply }) => reply(200, 'ok'));
		expectTypeOf<
			RoutesOf<typeof replaced>['/a']['POST']['output']['status']
		>().toEqualTypeOf<200 | 409 | 500>();
		const kept = alxia()
			.onRefusal(() => problem({ status: 409 }))
			.onRefusal('body_limit', () => problem({ status: 413 }))
			.post('/a', { body: Name }, ({ reply }) => reply(200, 'ok'));
		expectTypeOf<
			RoutesOf<typeof kept>['/a']['POST']['output']['status']
		>().toEqualTypeOf<200 | 409 | 500>();
	});

	test("a plugin's route behind the app's hooks: its kind's default replaced by the app's hook of that kind", () => {
		const plugin = alxia()
			.onRefusal('body_limit', () => problem({ status: 413 }))
			.post('/p', both, ({ reply }) => reply(200, 'ok'));
		const app = alxia()
			.onRefusal('validation', () => problem({ status: 422 }))
			.use(plugin);
		type P = RoutesOf<typeof app>['/p']['POST']['output'];
		expectTypeOf<P['status']>().toEqualTypeOf<200 | 413 | 422 | 500>();
		expectTypeOf<Extract<P, { status: 413 }>['data']>().toEqualTypeOf<{
			status: 413;
		}>();
	});

	test("a plugin's kind hook reaches the types of the app's routes after it", () => {
		const plugin = alxia().onRefusal('body_limit', () =>
			problem({ status: 413, detail: 'plugin' }),
		);
		const app = alxia()
			.onRefusal(() => problem({ status: 409 }))
			.use(plugin)
			.post('/a', both, ({ reply }) => reply(200, 'ok'));
		type A = RoutesOf<typeof app>['/a']['POST']['output'];
		expectTypeOf<A['status']>().toEqualTypeOf<200 | 409 | 413 | 500>();
	});

	test('mistakes are compile errors', () => {
		const _mistakes = () => {
			alxia().onRefusal(
				'validation',
				{ response: { 422: Invalid } },
				// @ts-expect-error: a status its schemas do not declare
				(_, { reply }) => reply(400, { detail: 'x' }),
			);
			// @ts-expect-error: a 4xx only
			alxia().onRefusal('body_limit', () => problem({ status: 500 }));
			// @ts-expect-error: no such kind
			alxia().onRefusal('timeout', () => undefined);
		};
		expect(_mistakes).toBeFunction();
	});
});
