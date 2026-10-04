import { describe, expect, expectTypeOf, test } from 'bun:test';
import { z } from 'zod';
import { vary } from '../reply/headers';
import type { StandardSchemaV1 } from '../schema/standard-schema';
import { eventStream } from '../sse/event-stream';
import { type AnyAlxia, alxia, type Plugin } from './alxia';

/** A schema written by hand: the core needs no validator library. */
function positive(): StandardSchemaV1<unknown, number> {
	return {
		'~standard': {
			version: 1,
			vendor: 'hand',
			validate: (value) => {
				const number = Number(value);
				return Number.isFinite(number) && number > 0
					? { value: number }
					: { issues: [{ message: 'Expected a positive number' }] };
			},
		},
	};
}

describe('any Standard Schema', () => {
	test('a hand-written schema validates and types the route', async () => {
		const app = alxia().get(
			'/items',
			{ query: { '~standard': objectOf({ page: positive() }) } },
			({ query, reply }) => {
				expectTypeOf(query).toEqualTypeOf<{ page: number }>();
				return reply(200, query.page);
			},
		);
		expect(await (await app.request('/items?page=2')).json()).toBe(2);
		expect((await app.request('/items?page=-1')).status).toBe(400);
	});
});

function objectOf<
	Shape extends Record<string, StandardSchemaV1<unknown, unknown>>,
>(
	shape: Shape,
): StandardSchemaV1<
	unknown,
	{
		[Key in keyof Shape]: NonNullable<
			Shape[Key]['~standard']['types']
		>['output'];
	}
>['~standard'] {
	return {
		version: 1,
		vendor: 'hand',
		validate: async (value) => {
			const input = (value ?? {}) as Record<string, unknown>;
			const output: Record<string, unknown> = {};
			const issues = [];
			for (const [key, schema] of Object.entries(shape)) {
				const result = await schema['~standard'].validate(input[key]);
				if (result.issues) {
					issues.push(
						...result.issues.map((issue) => ({ ...issue, path: [key] })),
					);
				} else output[key] = result.value;
			}
			return issues.length > 0 ? { issues } : { value: output as never };
		},
	};
}

describe('global hooks', () => {
	test('onResponse sees the length of a binary body; one set by the handler wins', async () => {
		const seen: (string | null)[] = [];
		const app = alxia()
			.onResponse((response) => {
				seen.push(response.headers.get('content-length'));
				return response;
			})
			.get('/view', ({ reply }) =>
				reply(200, new Uint8Array(2000).subarray(10, 20)),
			)
			.get('/blob', ({ reply }) => reply(200, new Blob(['abc'])))
			.get('/own', ({ reply }) =>
				reply(200, new Blob(['abc']), { headers: { 'content-length': '3' } }),
			);
		for (const path of ['/view', '/blob', '/own']) await app.request(path);
		expect(seen).toEqual(['10', '3', '3']);
	});

	test('onRequest answers before routing, onResponse sees every response', async () => {
		const seen: number[] = [];
		const app = alxia()
			.onRequest(({ request }) =>
				request.method === 'OPTIONS'
					? new Response(null, { status: 204 })
					: undefined,
			)
			.onResponse((response) => {
				seen.push(response.status);
				const headers = new Headers(response.headers);
				headers.set('x-powered-by', 'alxia');
				return new Response(response.body, {
					status: response.status,
					headers,
				});
			})
			.get('/', ({ reply }) => reply(200, 'home'));
		expect((await app.request('/', { method: 'OPTIONS' })).status).toBe(204);
		const home = await app.request('/');
		expect(home.headers.get('x-powered-by')).toBe('alxia');
		expect((await app.request('/nope')).status).toBe(404);
		expect(seen).toEqual([204, 200, 404]);
	});

	test('a function plugin adds global hooks and keeps the app type', async () => {
		const poweredBy =
			(name: string): Plugin =>
			(app) =>
				app.onResponse((response) => {
					response.headers.set('x-powered-by', name);
				});
		const app = alxia()
			.get('/a', ({ reply }) => reply(200, 'a'))
			.use(poweredBy('alxia'));
		expect((await app.request('/a')).headers.get('x-powered-by')).toBe('alxia');
	});

	test('onStart and onStop run with listen and stop', async () => {
		const events: string[] = [];
		const app = alxia()
			.onStart(() => {
				events.push('start');
			})
			.onStop(() => {
				events.push('stop');
			})
			.get('/', ({ reply }) => reply(200));
		app.listen({ port: 0 });
		await Bun.sleep(0);
		expect(app.server).toBeDefined();
		await app.stop(true);
		expect(events).toEqual(['start', 'stop']);
		expect(app.server).toBeUndefined();
	});
});

describe('group', () => {
	const app = alxia()
		.decorate({ role: 'guest' as string })
		.group('/admin', (admin) =>
			admin
				.derive(({ request, reply }) =>
					request.headers.get('x-admin') === 'yes'
						? { role: 'admin' }
						: reply(403, { error: 'forbidden' as const }),
				)
				.get('/stats', ({ role, reply }) => reply(200, { role })),
		)
		.get('/public', ({ role, reply }) => reply(200, { role }));

	test("a group's hooks guard only its routes", async () => {
		expect((await app.request('/admin/stats')).status).toBe(403);
		const admin = await app.request('/admin/stats', {
			headers: { 'x-admin': 'yes' },
		});
		expect(await admin.json()).toEqual({ role: 'admin' });
		expect(await (await app.request('/public')).json()).toEqual({
			role: 'guest',
		});
	});
});

describe('cookies', () => {
	test('every set-cookie a reply gives in its headers is sent', async () => {
		const headers = new Headers();
		headers.append('set-cookie', 'a=1; Path=/');
		headers.append('set-cookie', 'b=2; Path=/');
		const app = alxia().get('/two', ({ reply, set }) => {
			set.headers.append('set-cookie', 'z=0; Path=/');
			set.cookies.set('c', '3');
			return reply(200, 'ok', { headers });
		});
		const response = await app.request('/two');
		expect(response.headers.getSetCookie()).toEqual([
			'z=0; Path=/',
			'a=1; Path=/',
			'b=2; Path=/',
			'c=3; Path=/; SameSite=Lax',
		]);
	});

	const app = alxia()
		.get(
			'/session',
			{ cookies: z.object({ session: z.string() }) },
			({ cookies, reply }) => reply(200, cookies.session),
		)
		.post('/login', ({ set, reply }) => {
			set.cookies.set('session', 'abc', { httpOnly: true, path: '/' });
			return reply(204);
		});

	test('cookies are validated and set', async () => {
		expect((await app.request('/session')).status).toBe(400);
		const read = await app.request('/session', {
			headers: { cookie: 'session=abc' },
		});
		expect(await read.text()).toBe('abc');
		const login = await app.request('/login', { method: 'POST' });
		expect(login.headers.getSetCookie()[0]).toContain('session=abc');
		expect(login.headers.getSetCookie()[0]).toContain('HttpOnly');
	});
});

describe('requests', () => {
	test('HEAD runs the GET route and sends no body', async () => {
		const app = alxia().get('/a', ({ reply }) => reply(200, 'body'));
		const response = await app.request('/a', { method: 'HEAD' });
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('');
	});

	test('a body parser the app adds is tried first', async () => {
		const app = alxia()
			.parser('application/csv', async (request) =>
				(await request.text()).split(','),
			)
			.post('/csv', { body: z.array(z.string()) }, ({ body, reply }) =>
				reply(200, body.length),
			);
		const response = await app.request('/csv', {
			method: 'POST',
			headers: { 'content-type': 'application/csv' },
			body: 'a,b,c',
		});
		expect(await response.json()).toBe(3);
	});

	test('the ip is read by the option', async () => {
		const app = alxia({
			ip: (request) => request.headers.get('x-forwarded-for') ?? undefined,
		}).get('/ip', ({ ip, reply }) => reply(200, ip ?? 'none'));
		const response = await app.request('/ip', {
			headers: { 'x-forwarded-for': '10.0.0.1' },
		});
		expect(await response.text()).toBe('10.0.0.1');
	});
});

describe('server-sent events', () => {
	const Tick = z.object({ n: z.number() });
	const app = alxia()
		.get('/ticks', { response: { 200: eventStream(Tick) } }, ({ reply }) =>
			reply(
				200,
				(async function* () {
					yield { n: 1 };
					yield { n: 2 };
				})(),
			),
		)
		.get('/free', ({ reply }) =>
			reply(
				200,
				(async function* () {
					yield 'a';
				})(),
			),
		);

	test('each value is an event of JSON', async () => {
		const response = await app.request('/ticks');
		expect(response.headers.get('content-type')).toBe('text/event-stream');
		expect(await response.text()).toBe('data: {"n":1}\n\ndata: {"n":2}\n\n');
	});

	test('an event its schema refuses ends the stream', async () => {
		const original = console.error;
		console.error = () => {};
		try {
			const broken = alxia().get(
				'/broken',
				{ response: { 200: eventStream(Tick) } },
				({ reply }) =>
					reply(
						200,
						(async function* () {
							yield { n: 1 };
							yield JSON.parse('{"n":"x"}');
						})(),
					),
			);
			const response = await broken.request('/broken');
			await expect(response.text()).rejects.toThrow();
		} finally {
			console.error = original;
		}
	});
});

describe('websockets', () => {
	const Chat = z.object({ text: z.string().min(1) });
	const app = alxia()
		.derive(({ request }) => ({
			user: new URL(request.url).searchParams.get('user') ?? 'anonymous',
		}))
		.ws(
			'/rooms/:room',
			{ message: Chat, send: z.object({ from: z.string(), text: z.string() }) },
			{
				open(socket) {
					expectTypeOf(socket.data.params.room).toBeString();
					socket.subscribe(socket.data.params.room);
				},
				async message(socket, chat) {
					expectTypeOf(chat).toEqualTypeOf<{ text: string }>();
					await socket.send({ from: socket.data.user, text: chat.text });
				},
			},
		);

	test('messages are validated, replies sent as JSON', async () => {
		const server = app.listen({ port: 0 });
		try {
			const url = new URL('/rooms/lobby?user=ada', server.url);
			url.protocol = 'ws:';
			const socket = new WebSocket(url);
			const received: unknown[] = [];
			const done = new Promise<void>((resolve) => {
				socket.onmessage = (event) => {
					received.push(JSON.parse(String(event.data)));
					if (received.length === 2) resolve();
				};
			});
			await new Promise((resolve) => {
				socket.onopen = resolve;
			});
			socket.send(JSON.stringify({ text: '' }));
			socket.send(JSON.stringify({ text: 'hello' }));
			await done;
			socket.close();
			expect(received[0]).toMatchObject({ error: 'validation' });
			expect(received[1]).toEqual({ from: 'ada', text: 'hello' });
		} finally {
			await app.stop(true);
		}
	});

	test('Bun.serve opens them with fetch and websocket, as listen does', async () => {
		const server = Bun.serve({
			port: 0,
			fetch: app.fetch,
			websocket: app.websocket,
		});
		try {
			const url = new URL('/rooms/lobby?user=grace', server.url);
			url.protocol = 'ws:';
			const socket = new WebSocket(url);
			const received = new Promise<unknown>((resolve) => {
				socket.onmessage = (event) => resolve(JSON.parse(String(event.data)));
			});
			await new Promise((resolve) => {
				socket.onopen = resolve;
			});
			socket.send(JSON.stringify({ text: 'hi' }));
			expect(await received).toEqual({ from: 'grace', text: 'hi' });
			socket.close();
		} finally {
			await server.stop(true);
		}
	});

	test('without a server, or without an upgrade, a socket route is a 426', async () => {
		const response = await app.request('/rooms/lobby');
		expect(response.status).toBe(426);
	});
});

describe('plugins typed as functions', () => {
	test('Plugin is assignable from a generic function', () => {
		const identity: Plugin = <App extends AnyAlxia>(app: App) => app;
		expect(typeof identity).toBe('function');
	});
});

describe('around', () => {
	test('wraps every request, the first declared outermost, and sees the route and error', async () => {
		const seen: string[] = [];
		const app = alxia()
			.around(async (ctx, next) => {
				seen.push('outer:in');
				const response = await next();
				seen.push(
					`outer:out ${ctx.route} ${response.status} ${ctx.error instanceof Error}`,
				);
				return response;
			})
			.around(async (_ctx, next) => {
				seen.push('inner:in');
				const response = await next();
				response.headers.set('x-wrapped', 'yes');
				return response;
			})
			.onRequest(() => {
				seen.push('onRequest');
			})
			.get('/users/:id', ({ reply }) => reply(200))
			.get('/boom', () => {
				throw new Error('boom');
			});
		const response = await app.request('/users/1');
		expect(response.headers.get('x-wrapped')).toBe('yes');
		expect(seen).toEqual([
			'outer:in',
			'inner:in',
			'onRequest',
			'outer:out /users/:id 200 false',
		]);
		const original = console.error;
		console.error = () => {};
		try {
			seen.length = 0;
			await app.request('/boom');
			expect(seen.at(-1)).toBe('outer:out /boom 500 true');
			seen.length = 0;
			await app.request('/nope');
			expect(seen.at(-1)).toBe('outer:out undefined 404 false');
		} finally {
			console.error = original;
		}
	});

	test('an around hook keeps its async context through the handler', async () => {
		const { AsyncLocalStorage } = await import('node:async_hooks');
		const storage = new AsyncLocalStorage<string>();
		const app = alxia()
			.around((_ctx, next) => storage.run('request-1', next))
			.get('/', async ({ reply }) => {
				await Bun.sleep(1);
				return reply(200, storage.getStore() ?? 'lost');
			});
		expect(await (await app.request('/')).text()).toBe('request-1');
	});
});

describe('wrap', () => {
	const order: string[] = [];
	const app = alxia()
		.get('/before', ({ reply }) => reply(200, 'before'))
		.wrap(async ({ request, reply }, next) => {
			order.push('wrap:in');
			if (request.headers.get('x-busy') === 'yes') {
				return reply(409, { error: 'busy' as const });
			}
			try {
				const response = await next();
				order.push(`wrap:out ${response.status}`);
				response.headers.set('x-wrapped', 'yes');
				return response;
			} catch (error) {
				order.push('wrap:caught');
				throw error;
			}
		})
		.derive(({ pathParams }) => {
			order.push(`derive ${pathParams['id'] ?? '-'}`);
			return { seen: true };
		})
		.get(
			'/items/:id',
			{ params: z.object({ id: z.coerce.number() }) },
			({ params, seen, reply }) => {
				order.push('handler');
				return reply(200, { id: params.id, seen });
			},
		)
		.get('/fail', () => {
			throw new Error('fail');
		});

	test('runs around the hooks after it, validation and the handler', async () => {
		order.length = 0;
		const response = await app.request('/items/7');
		expect(await response.json()).toEqual({ id: 7, seen: true });
		expect(response.headers.get('x-wrapped')).toBe('yes');
		expect(order).toEqual(['wrap:in', 'derive 7', 'handler', 'wrap:out 200']);
		order.length = 0;
		expect((await app.request('/items/x')).status).toBe(400);
		expect(order).toEqual(['wrap:in', 'derive x', 'wrap:out 400']);
	});

	test('only for the routes after it', async () => {
		order.length = 0;
		const before = await app.request('/before', {
			headers: { 'x-busy': 'yes' },
		});
		expect(before.status).toBe(200);
		expect(order).toEqual([]);
		const busy = await app.request('/items/1', {
			headers: { 'x-busy': 'yes' },
		});
		expect(busy.status).toBe(409);
	});

	test("the handler's error reaches it, then onError", async () => {
		const original = console.error;
		console.error = () => {};
		try {
			order.length = 0;
			expect((await app.request('/fail')).status).toBe(500);
			expect(order).toEqual(['wrap:in', 'derive -', 'wrap:caught']);
		} finally {
			console.error = original;
		}
	});
});

describe('Vary', () => {
	test("a reply's Vary adds to the one set on set.headers", async () => {
		const app = alxia()
			.derive(({ set }) => {
				vary(set.headers, 'Accept-Language');
				return {};
			})
			.get('/', ({ reply }) =>
				reply(200, 'ok', {
					headers: { vary: 'Accept-Encoding, accept-language', etag: '"1"' },
				}),
			)
			.get('/plain', ({ reply }) => reply(200, 'ok'));
		const response = await app.request('/');
		expect(response.headers.get('vary')).toBe(
			'Accept-Language, Accept-Encoding',
		);
		expect(response.headers.get('etag')).toBe('"1"');
		expect((await app.request('/plain')).headers.get('vary')).toBe(
			'Accept-Language',
		);
	});

	test('`*` replaces the names, and an empty name adds nothing', () => {
		const headers = new Headers({ vary: 'Accept-Language' });
		vary(headers, ' ');
		expect(headers.get('vary')).toBe('Accept-Language');
		vary(headers, '*');
		expect(headers.get('vary')).toBe('*');
		vary(headers, 'Cookie');
		expect(headers.get('vary')).toBe('*');
	});
});

describe('reply shortcuts', () => {
	const User = z.object({ id: z.number(), name: z.string() });
	const NotFound = z.object({ error: z.literal('not_found') });

	const free = alxia()
		.get('/ok', ({ reply }) => reply.ok({ id: 1 }))
		.post('/created', ({ reply }) => reply.created({ id: 2 }))
		.delete('/gone', ({ reply }) => reply.noContent())
		.get('/missing', ({ reply }) => reply.notFound({ error: 'not_found' }))
		.get('/page', ({ reply }) =>
			reply.html(200, '<h1>Hi</h1>', { headers: { 'x-page': '1' } }),
		);

	const typed = alxia()
		.get(
			'/users/:id',
			{
				params: z.object({ id: z.coerce.number() }),
				response: { 200: User, 404: NotFound },
			},
			({ params, reply }) =>
				params.id === 1
					? reply.ok({ id: 1, name: 'Ada' })
					: reply.notFound({ error: 'not_found' }),
		)
		.delete('/users/:id', { response: { 204: z.undefined() } }, ({ reply }) =>
			reply.noContent(),
		)
		.get('/doc', { response: { 200: z.string() } }, ({ reply }) =>
			reply.html(200, '<p>doc</p>'),
		);

	test('each is reply(status, body): status, body, headers', async () => {
		const ok = await free.request('/ok');
		expect([ok.status, await ok.json()]).toEqual([200, { id: 1 }]);
		const created = await free.request('/created', { method: 'POST' });
		expect(created.status).toBe(201);
		const gone = await free.request('/gone', { method: 'DELETE' });
		expect([gone.status, await gone.text()]).toEqual([204, '']);
		expect((await free.request('/missing')).status).toBe(404);
		const page = await free.request('/page');
		expect(page.headers.get('content-type')).toBe('text/html;charset=utf-8');
		expect(page.headers.get('x-page')).toBe('1');
		expect(await page.text()).toBe('<h1>Hi</h1>');
	});

	test('with schemas: the declared statuses only, the body checked', async () => {
		expect(await (await typed.request('/users/1')).json()).toEqual({
			id: 1,
			name: 'Ada',
		});
		expect((await typed.request('/users/2')).status).toBe(404);
		expect((await typed.request('/users/1', { method: 'DELETE' })).status).toBe(
			204,
		);
		expect(await (await typed.request('/doc')).text()).toBe('<p>doc</p>');

		alxia().get('/x', { response: { 200: User } }, ({ reply }) => {
			// @ts-expect-error no 404 declared: no notFound
			void reply.notFound;
			// @ts-expect-error no 204 declared: no noContent
			void reply.noContent;
			return reply.ok({ id: 1, name: 'Ada' });
		});
		alxia().delete('/y', { response: { 204: z.null() } }, ({ reply }) => {
			// @ts-expect-error 204's schema takes no undefined: no noContent
			void reply.noContent;
			return reply(204, null);
		});
		alxia().get('/z', { response: { 200: User } }, ({ reply }) => {
			// @ts-expect-error a body the schema refuses
			void reply.ok({ id: 'one', name: 'Ada' });
			// @ts-expect-error html for a status whose schema takes no string
			void reply.html(200, '<p>no</p>');
			return reply.ok({ id: 1, name: 'Ada' });
		});
	});
});
