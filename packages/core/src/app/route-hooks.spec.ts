import { describe, expect, expectTypeOf, test } from 'bun:test';
import { z } from 'zod';
import { problem } from '../reply/problem';
import type { Reply } from '../reply/reply';
import { alxia } from './alxia';
import { defineHook, defineWrap } from './define-hook';
import { definePlugin } from './define-plugin';
import type { AnyRouteHook, RouteHook, RouteWrap } from './types';

interface User {
	readonly id: string;
}

/** Adds a `user` from `x-user`, or ends the request with a 401. */
const session = alxia().derive(({ request, reply }) => {
	const id = request.headers.get('x-user');
	return id === null
		? reply(401, { error: 'unauthenticated' as const })
		: { user: { id } satisfies User };
});

/** The owner alone may see a bookmark: its id starts with the user's. */
const canView = defineHook<{ user: User; params: { id: string } }>()(
	async ({ user, params, reply }) =>
		params.id.startsWith(user.id)
			? undefined
			: reply(403, { error: 'forbidden' as const }),
);

/** Loads the bookmark the path names. */
const loadBookmark = defineHook<{ params: { id: string } }>()(({ params }) => ({
	bookmark: { id: params.id, locked: params.id.endsWith('-locked') },
}));

/** Reads what `loadBookmark` added: a locked one is a 409. */
const canEdit = defineHook<{ bookmark: { locked: boolean } }>()(
	({ bookmark, reply }) =>
		bookmark.locked
			? reply(409, { error: 'locked' as const })
			: { editable: true as const },
);

const Update = z.object({ title: z.string().min(1) });

const bookmarks = alxia()
	.plugin(session)
	.patch(
		'/bookmarks/:id',
		[canView, loadBookmark, canEdit],
		{
			body: Update,
			response: { 200: z.object({ id: z.string(), title: z.string() }) },
		},
		({ params, body, bookmark, editable, reply }) => {
			expectTypeOf(editable).toEqualTypeOf<true>();
			return reply.ok({ id: `${params.id}:${bookmark.id}`, title: body.title });
		},
	);

const patch = (id: string, body: unknown, user: string | null = 'ada') =>
	bookmarks.request(`/bookmarks/${id}`, {
		method: 'PATCH',
		headers: {
			'content-type': 'application/json',
			...(user === null ? {} : { 'x-user': user }),
		},
		body: JSON.stringify(body),
	});

describe('hooks given to a route', () => {
	test('run after the hooks in force, in the order of the list, then validation, then the handler', async () => {
		const ran: string[] = [];
		const step = (name: string) =>
			defineHook(() => {
				ran.push(name);
			});
		const app = alxia()
			.derive(() => {
				ran.push('scope');
			})
			.post(
				'/',
				[step('first'), step('second')],
				{
					body: {
						'~standard': {
							version: 1,
							vendor: 'spec',
							validate: (value: unknown) => {
								ran.push('validation');
								return { value };
							},
						},
					},
				},
				({ reply }) => {
					ran.push('handler');
					return reply(204);
				},
			);
		await app.request('/', { method: 'POST', body: '{}' });
		expect(ran).toEqual(['scope', 'first', 'second', 'validation', 'handler']);
	});

	test('thread what each adds to the hooks after it and to the handler', async () => {
		const response = await patch('ada-1', { title: 'Bun' });
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ id: 'ada-1:ada-1', title: 'Bun' });
	});

	test('a hook that replies ends the request: neither the hooks after it nor the handler run', async () => {
		const ran: string[] = [];
		const after = defineHook(() => {
			ran.push('after');
		});
		const app = alxia().get(
			'/',
			[
				defineHook(({ reply }) => reply(403, { error: 'forbidden' as const })),
				after,
			],
			({ reply }) => {
				ran.push('handler');
				return reply(200, 'ok');
			},
		);
		const response = await app.request('/');
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: 'forbidden' });
		expect(ran).toEqual([]);
		expect((await patch('ada-1-locked', { title: 'Bun' })).status).toBe(409);
	});

	test('run before validation: a hook refusing with 403 answers a body the schema would refuse', async () => {
		const response = await patch('bob-1', { title: '' });
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: 'forbidden' });
		expect((await patch('ada-1', { title: '' })).status).toBe(400);
	});

	test('read params, query and cookies as they arrived, whatever the schemas make of them', async () => {
		const seen: unknown[] = [];
		const raw = defineHook(({ params, query, cookies }) => {
			expectTypeOf(params).toEqualTypeOf<Readonly<Record<string, string>>>();
			seen.push(params, query, cookies);
		});
		const typed = defineHook<{ params: { id: string } }>()(({ params }) => {
			expectTypeOf(params.id).toEqualTypeOf<string>();
			seen.push(typeof params.id);
		});
		const app = alxia().get(
			'/items/:id',
			[raw, typed],
			{
				params: z.object({ id: z.coerce.number() }),
				query: z.object({ page: z.coerce.number() }),
				cookies: z.object({ visits: z.coerce.number() }),
			},
			({ params, query, cookies, reply }) => {
				expectTypeOf(params.id).toEqualTypeOf<number>();
				return reply(200, {
					id: params.id,
					page: query.page,
					visits: cookies.visits,
				});
			},
		);
		const response = await app.request('/items/7?page=2', {
			headers: { cookie: 'visits=3' },
		});
		expect(await response.json()).toEqual({ id: 7, page: 2, visits: 3 });
		expect(seen).toEqual([
			{ id: '7' },
			{ page: '2' },
			{ visits: '3' },
			'string',
		]);
	});

	test('a wrap in the list runs the rest inside it, and its reply joins the route', async () => {
		const ran: string[] = [];
		const around = defineWrap(async ({ request, reply }, next) => {
			if (request.headers.has('x-busy'))
				return reply(409, { error: 'busy' as const });
			ran.push('before');
			const response = await next();
			ran.push('after');
			return response;
		});
		const app = alxia().get(
			'/',
			[around, defineHook(() => void ran.push('hook'))],
			({ reply }) => {
				ran.push('handler');
				return reply(200, 'ok');
			},
		);
		expect((await app.request('/')).status).toBe(200);
		expect(ran).toEqual(['before', 'hook', 'handler', 'after']);
		expect(
			(await app.request('/', { headers: { 'x-busy': '1' } })).status,
		).toBe(409);
	});

	test('a thrown error reaches the onError hooks in force', async () => {
		const app = alxia()
			.onError((error, { reply }) => reply(503, { error: String(error) }))
			.get(
				'/',
				[
					defineHook(() => {
						throw 'down';
					}),
				],
				({ reply }) => reply(200, 'ok'),
			);
		const response = await app.request('/');
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'down' });
	});

	test('a route of the list is no part of the routes after it', async () => {
		const deny = defineHook(({ reply }) =>
			reply(403, { error: 'forbidden' as const }),
		);
		const app = alxia()
			.get('/private', [deny], ({ reply }) => reply(200, 'secret'))
			.get('/public', ({ reply }) => reply(200, 'hello'));
		expect((await app.request('/private')).status).toBe(403);
		expect(await (await app.request('/public')).text()).toBe('hello');
	});

	test('anything not made by defineHook or defineWrap is refused where the route is declared', () => {
		expect(() =>
			alxia().get(
				'/',
				[(() => undefined) as unknown as RouteHook],
				({ reply }) => reply(200, 'x'),
			),
		).toThrow(
			'GET /: hook 1 of the list is not a hook: make it with defineHook() or defineWrap()',
		);
		expect(() => defineHook(1 as never)).toThrow(
			'defineHook(): the hook is not a function',
		);
	});
});

describe('the types of a route with hooks', () => {
	test('a hook made once is typed by what it reads and returns', () => {
		expectTypeOf(canEdit).toEqualTypeOf<
			RouteHook<
				{ bookmark: { locked: boolean } },
				Reply<409, { readonly error: 'locked' }> | { editable: true }
			>
		>();
		const wrap = defineWrap(async (_ctx, next) => next());
		expectTypeOf(wrap).toEqualTypeOf<
			RouteWrap<Record<never, never>, Response>
		>();
		const owned = defineWrap<{ user: User }>()(async ({ user, reply }, next) =>
			user.id === 'ada' ? next() : reply(403, { error: 'forbidden' as const }),
		);
		expectTypeOf(owned).toEqualTypeOf<
			RouteWrap<
				{ user: User },
				Response | Reply<403, { readonly error: 'forbidden' }>
			>
		>();
		alxia()
			.plugin(session)
			.get('/', [owned], ({ reply }) => reply(200, 'x'));
		// @ts-expect-error a wrap's requirement is checked as a hook's
		alxia().get('/', [owned], ({ reply }) => reply(200, 'x'));
		// @ts-expect-error what a hook reads is named before the hook, never beside it
		defineHook<{ user: User }>(({ user }) => ({ id: user.id }));
	});

	test('a hook whose requirement the route does not give is a compile error', () => {
		const withUser = () => alxia().plugin(session);
		// The probe: the same calls compile where the context gives it.
		withUser().get('/:id', [canView], ({ reply }) => reply(200, 'x'));
		withUser().get('/:id', [loadBookmark, canEdit], ({ reply }) =>
			reply(200, 'x'),
		);
		// @ts-expect-error no hook before gives `user`
		alxia().get('/:id', [canView], ({ reply }) => reply(200, 'x'));
		// @ts-expect-error the path declares no `id`
		withUser().get('/all', [canView], ({ reply }) => reply(200, 'x'));
		// @ts-expect-error `bookmark` is added by a hook after it, not before
		withUser().get('/:id', [canEdit, loadBookmark], ({ reply }) =>
			reply(200, 'x'),
		);
		alxia()
			.derive(() => ({ user: 1 }))
			// @ts-expect-error `user` is given with another type
			.get('/:id', [canView], ({ reply }) => reply(200, 'x'));
	});

	test('params, pathParams, query and cookies are named as the strings they arrive as', () => {
		const byId = defineHook<{ pathParams: { id: string } }>()(
			({ pathParams }) => {
				expectTypeOf(pathParams.id).toEqualTypeOf<string>();
				return { id: pathParams.id };
			},
		);
		const page = defineHook<{ query: { page?: string | readonly string[] } }>()(
			() => {},
		);
		const sid = defineHook<{ cookies: { sid?: string } }>()(() => {});
		// The probes: each compiles where it arrives as named.
		alxia().get('/:id', [byId, page, sid], ({ id, reply }) => reply(200, id));
		// @ts-expect-error the path declares no `id`
		alxia().get('/all', [byId], ({ reply }) => reply(200, 'x'));
		const numberId = defineHook<{ params: { id: number } }>()(() => {});
		// @ts-expect-error a path parameter arrives as a string, never a number
		alxia().get('/:id', [numberId], ({ reply }) => reply(200, 'x'));
		const numberPage = defineHook<{ query: { page?: number } }>()(() => {});
		// @ts-expect-error a query parameter arrives as a string or a list of them
		alxia().get('/', [numberPage], ({ reply }) => reply(200, 'x'));
		const onePage = defineHook<{ query: { page?: string } }>()(() => {});
		// @ts-expect-error a repeated query parameter arrives as a list
		alxia().get('/', [onePage], ({ reply }) => reply(200, 'x'));
		const numberSid = defineHook<{ cookies: { sid?: number } }>()(() => {});
		// @ts-expect-error a cookie arrives as a string
		alxia().get('/', [numberSid], ({ reply }) => reply(200, 'x'));
		const readsBody = defineHook<{ body: { title: string } }>()(() => {});
		// @ts-expect-error a hook runs before the body is read: it never reads one
		alxia().post('/', [readsBody], { body: Update }, ({ reply }) => reply(204));
	});

	test('route() and ws check the list as the route methods do', () => {
		const op = { method: 'GET', path: '/b/:id' } as const;
		const handlers = { message: () => {} };
		// The probes.
		alxia()
			.plugin(session)
			.route(op, [canView], ({ reply }) => reply(200, 'x'));
		alxia().plugin(session).ws('/b/:id', [canView], {}, handlers);
		// @ts-expect-error no hook before gives `user`
		alxia().route(op, [canView], ({ reply }) => reply(200, 'x'));
		// @ts-expect-error no hook before gives `user`
		alxia().ws('/b/:id', [canView], {}, handlers);
	});

	test('a list is written in the call, so each of its hooks is checked', () => {
		const list: AnyRouteHook[] = [canView];
		const app = alxia().plugin(session);
		// The probe: a tuple kept `as const` is checked like one written inline.
		const tuple = [canView, loadBookmark] as const;
		app.get('/t/:id', tuple, ({ bookmark, reply }) => reply(200, bookmark.id));
		// @ts-expect-error a list of unknown length
		app.get('/:id', list, ({ reply }) => reply(200, 'x'));
	});

	test('a hook returning any is a hook, not the function that takes one', () => {
		const untyped = defineHook(() => JSON.parse('{}'));
		expectTypeOf(untyped).toEqualTypeOf<RouteHook<Record<never, never>, any>>();
		alxia().get('/', [untyped], ({ reply }) => reply(200, 'x'));
	});

	test('a list of at most 8 hooks', () => {
		const h = defineHook(() => ({ n: 1 }));
		alxia().get('/', [h, h, h, h, h, h, h, h], ({ n, reply }) => reply(200, n));
		// @ts-expect-error a ninth hook
		alxia().get('/', [h, h, h, h, h, h, h, h, h], ({ reply }) =>
			reply(200, 'x'),
		);
	});

	test('the path is checked as in every other form', () => {
		expect(() =>
			// @ts-expect-error a path the app refuses
			alxia().get('/at/10:30', [defineHook(() => {})], ({ reply }) =>
				reply(200, 'x'),
			),
		).toThrow('"/at/10:30": ":" may only start a segment');
	});
});

describe('hooks given to a route, with the rest of the app', () => {
	test('in a group, under its prefix and behind its hooks', async () => {
		const app = alxia().group('/api', (api) =>
			api
				.plugin(session)
				.get('/bookmarks/:id', [canView], ({ params, reply }) =>
					reply(200, params.id),
				),
		);
		expect(
			(
				await app.request('/api/bookmarks/ada-1', {
					headers: { 'x-user': 'ada' },
				})
			).status,
		).toBe(200);
		expect(
			(
				await app.request('/api/bookmarks/bob-1', {
					headers: { 'x-user': 'ada' },
				})
			).status,
		).toBe(403);
		expect((await app.request('/api/bookmarks/ada-1')).status).toBe(401);
	});

	test('in a plugin, behind the hooks of the app using it', async () => {
		const plugin = definePlugin<{ user: User }>()((app) =>
			app.get('/bookmarks/:id', [canView], ({ reply }) => reply(200, 'mine')),
		);
		const app = alxia({ prefix: '/v1' }).plugin(session).plugin(plugin);
		expect(
			(
				await app.request('/v1/bookmarks/ada-1', {
					headers: { 'x-user': 'ada' },
				})
			).status,
		).toBe(200);
		expect(
			(
				await app.request('/v1/bookmarks/bob-1', {
					headers: { 'x-user': 'ada' },
				})
			).status,
		).toBe(403);
	});

	test('a refusal after the hooks is answered by the onRefusal hook of its kind, under the bodyLimit', async () => {
		const app = alxia()
			.plugin(session)
			.bodyLimit(16)
			.onRefusal('body_limit', (refusal) =>
				problem({ status: 413, limit: refusal.limit }),
			)
			.onRefusal('validation', (refusal) =>
				problem({ status: 422, detail: refusal.part }),
			)
			.post('/bookmarks/:id', [canView], { body: Update }, ({ reply }) =>
				reply(204),
			);
		const post = (id: string, body: string) =>
			app.request(`/bookmarks/${id}`, {
				method: 'POST',
				headers: { 'x-user': 'ada', 'content-type': 'application/json' },
				body,
			});
		expect((await post('bob-1', '{}')).status).toBe(403);
		expect((await post('ada-1', '{}')).status).toBe(422);
		expect(
			(await post('ada-1', JSON.stringify({ title: 'x'.repeat(32) }))).status,
		).toBe(413);
		expect((await post('ada-1', JSON.stringify({ title: 'Bun' }))).status).toBe(
			204,
		);
	});

	test('route() takes the list before the handler', async () => {
		const app = alxia()
			.plugin(session)
			.route(
				{
					method: 'GET',
					path: '/bookmarks/:id',
					schema: { response: { 200: z.string() } },
				} as const,
				[canView, loadBookmark],
				({ bookmark, reply }) => reply(200, bookmark.id),
			);
		const response = await app.request('/bookmarks/ada-2', {
			headers: { 'x-user': 'ada' },
		});
		expect(await response.text()).toBe('ada-2');
		expect(
			(await app.request('/bookmarks/bob-2', { headers: { 'x-user': 'ada' } }))
				.status,
		).toBe(403);
	});

	test('a socket route runs its hooks on the upgrade, skipping a wrap, and its handlers read what they add', async () => {
		let wrapped = false;
		const app = alxia()
			.plugin(session)
			.ws(
				'/rooms/:id',
				[
					canView,
					loadBookmark,
					defineWrap((_ctx, next) => {
						wrapped = true;
						return next();
					}),
				],
				{},
				{
					open(socket) {
						expectTypeOf(socket.data.bookmark.id).toEqualTypeOf<string>();
						void socket.send(socket.data.bookmark.id);
					},
					message: () => {},
				},
			);
		const server = app.listen({ port: 0 });
		try {
			const refused = await app.request('/rooms/bob-1', {
				headers: { 'x-user': 'ada', upgrade: 'websocket' },
			});
			expect(refused.status).toBe(403);
			const url = new URL('/rooms/ada-1', server.url);
			url.protocol = 'ws:';
			const socket = new WebSocket(url, {
				headers: { 'x-user': 'ada' },
			} as never);
			const received = await new Promise<string>((resolve) => {
				socket.onmessage = (event) => resolve(String(event.data));
			});
			socket.close();
			expect(JSON.parse(received)).toBe('ada-1');
			expect(wrapped).toBe(false);
		} finally {
			await app.stop(true);
		}
	});
});
