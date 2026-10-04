import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia, type BaseContext, type Empty, validate } from '@alxia/core';
import {
	createMemoryStores,
	fixedClock,
	janus,
	type Session,
	scryptHasher,
} from '@nxgt/janus';
import {
	createMemoryRelations,
	defineModel,
	fromField,
	permissions,
	when,
} from '@nxgt/janus/permissions';
import { z } from 'zod';
import { janusErrors } from './errors';
import { byParam, permission } from './permission';
import { sendSession, signOut } from './send';
import { type SessionOptions, session } from './session';

const ada = { email: 'ada@example.test', name: 'Ada Lovelace' };
const password = 'correct horse';
const DAY = 86_400_000;

function setup() {
	const clock = fixedClock(Date.UTC(2026, 8, 24));
	const stores = createMemoryStores();
	const outage = { on: false };
	const find = stores.sessions.findSessionByTokenHash.bind(stores.sessions);
	const auth = janus({
		users: {
			patient: {
				schema: z.strictObject({ email: z.email(), name: z.string() }),
				password: { login: 'email' },
				session: { lifespan: '7d', renewAfter: '1d' },
			},
			staff: {
				schema: z.strictObject({ username: z.string() }),
				password: { login: 'username' },
			},
		},
		store: {
			...stores,
			sessions: {
				...stores.sessions,
				findSessionByTokenHash: (hash) => {
					if (outage.on) throw new Error('connection refused');
					return find(hash);
				},
			},
		},
		hasher: scryptHasher({ cost: 10 }),
		clock,
	});
	const model = defineModel({
		subjects: auth.types,
		types: {
			record: {
				related: {
					owners: ['patient'],
					doctors: fromField('doctorId', 'staff'),
				},
				permits: {
					view: ['owners', 'doctors'],
					edit: [when('owners', (ctx: { locked: boolean }) => !ctx.locked)],
				},
			},
		},
	});
	const access = permissions({ model, store: createMemoryRelations() });
	const records = new Map([
		['r1', { id: 'r1', doctorId: null as string | null, title: 'Blood test' }],
	]);

	const app = alxia()
		.use(janusErrors())
		.post(
			'/signup',
			validate({
				body: z.object({
					email: z.string(),
					name: z.string(),
					password: z.string(),
				}),
			}),
			async (ctx) => {
				const signedIn = await auth.patient.signUp(ctx.body);
				return ctx.reply(201, { id: sendSession(ctx, auth, signedIn).id });
			},
		)
		.post(
			'/signin',
			validate({ body: z.object({ email: z.string(), password: z.string() }) }),
			async (ctx) => {
				const signedIn = await auth.patient.signIn(ctx.body);
				return ctx.reply(200, { id: sendSession(ctx, auth, signedIn).id });
			},
		)
		.post('/signout', async (ctx) => ctx.reply(200, await signOut(ctx, auth)))
		.get('/whoami', async ({ reply }) => reply(200, 'anyone'))
		.use(session(auth, { type: 'patient', required: true }))
		.get('/me', ({ user, session: current, reply }) => {
			expectTypeOf(user.email).toBeString();
			expectTypeOf(current).toEqualTypeOf<Session>();
			return reply(200, { name: user.name });
		})
		.group('/records/:id', (records_) =>
			records_
				.use(
					permission(
						access,
						'view',
						'record',
						byParam('id', (id) => records.get(id) ?? null),
					),
				)
				.get('/', ({ object, reply }) => reply(200, { title: object.title })),
		);
	return { auth, access, clock, outage, app };
}

const cookieOf = (response: Response) =>
	response.headers
		.getSetCookie()
		.find((value) => value.startsWith('janus-session='));
const tokenOf = (response: Response) =>
	cookieOf(response)?.split(';')[0]?.split('=')[1] ?? '';

async function signUp(app: ReturnType<typeof setup>['app']) {
	const response = await app.request('/signup', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ ...ada, password }),
	});
	return { response, token: tokenOf(response) };
}

describe('session', () => {
	test('a sign-up sends the cookie, and the session reads the user', async () => {
		const { app } = setup();
		const { response, token } = await signUp(app);
		expect(response.status).toBe(201);
		expect(cookieOf(response)).toContain('HttpOnly');
		expect(JSON.stringify(await response.json())).not.toContain(token);
		const me = await app.request('/me', {
			headers: { cookie: `janus-session=${token}` },
		});
		expect(await me.json()).toEqual({ name: 'Ada Lovelace' });
		const bearer = await app.request('/me', {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(bearer.status).toBe(200);
	});

	test('anonymous is a 401; routes before the session are open', async () => {
		const { app } = setup();
		const anonymous = await app.request('/me');
		expect(anonymous.status).toBe(401);
		expect(await anonymous.json()).toEqual({ error: 'unauthenticated' });
		expect((await app.request('/whoami')).status).toBe(200);
	});

	test('ctx.auth: send, signOut and device, bound to the request', async () => {
		const { auth } = setup();
		await auth.patient.signUp({ ...ada, password });
		const app = alxia()
			.use(janusErrors())
			.use(session(auth, { type: 'patient', device: { name: 'my-device' } }))
			.post(
				'/signin',
				validate({
					body: z.object({ email: z.string(), password: z.string() }),
				}),
				async ({ body, auth: current, reply }) => {
					expectTypeOf(current.device).toEqualTypeOf<string | null>();
					const signedIn = await auth.patient.signIn(body);
					return reply.ok({
						id: current.send(signedIn).id,
						device: current.device,
					});
				},
			)
			.post('/signout', async ({ auth: current, reply }) =>
				reply.ok(await current.signOut()),
			)
			.get('/me', ({ user, reply }) => reply.ok({ name: user?.name ?? null }));

		const signedIn = await app.request('/signin', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: 'my-device=d-1',
			},
			body: JSON.stringify({ email: ada.email, password }),
		});
		expect((await signedIn.json()).device).toBe('d-1');
		const token = tokenOf(signedIn);
		expect(token).not.toBe('');
		const cookie = `janus-session=${token}`;
		expect(
			await (await app.request('/me', { headers: { cookie } })).json(),
		).toEqual({ name: 'Ada Lovelace' });

		const out = await app.request('/signout', {
			method: 'POST',
			headers: { cookie },
		});
		expect(await out.json()).toBe(true);
		expect(cookieOf(out)).toContain('janus-session=;');
		expect(
			await (await app.request('/me', { headers: { cookie } })).json(),
		).toEqual({ name: null });
	});

	test('required as a boolean: user may be null, and the 401 is in the type', async () => {
		const { auth } = setup();
		for (const required of [true, false]) {
			const app = alxia()
				.use(session(auth, { required }))
				.get('/me', ({ user, reply }) => {
					const anonymous: typeof user = null; // compiles only if user may be null
					void anonymous;
					return reply(200, { signedIn: user !== null });
				});
			const anonymous = await app.request('/me');
			expect(anonymous.status).toBe(required ? 401 : 200);
		}
		// A wrapper forwarding the options as they are typed compiles too.
		const forwarded = (options: SessionOptions<'patient'>) =>
			session(auth, options);
		expect(forwarded({}).routes).toEqual([]);
	});

	test('session() twice, one instance: a request is looked up once', async () => {
		const { auth, outage } = setup();
		await auth.patient.signUp({ ...ada, password });
		const { token } = await auth.patient.signIn({ email: ada.email, password });
		const lookedUp = { count: 0 };
		const counted = {
			...auth,
			authenticate: ((...args: Parameters<typeof auth.authenticate>) => {
				lookedUp.count++;
				return auth.authenticate(...args);
			}) as typeof auth.authenticate,
		};
		const app = alxia()
			.use(janusErrors())
			.use(session(counted))
			.use(session(counted, { required: true }))
			.get('/me', ({ user, reply }) => reply.ok({ type: user.type }))
			.use(session(counted, { type: 'patient' }))
			.get('/patient', ({ reply }) => reply.ok('patient'));
		const cookie = `janus-session=${token}`;
		expect((await app.request('/me', { headers: { cookie } })).status).toBe(
			200,
		);
		expect(lookedUp.count).toBe(1);
		lookedUp.count = 0;
		await app.request('/patient', { headers: { cookie } });
		expect(lookedUp.count).toBe(2); // another `type` is its own lookup

		// A failed lookup is not kept: the same Request object asks again.
		const request = new Request('http://localhost/me', { headers: { cookie } });
		outage.on = true;
		expect((await app.fetch(request)).status).toBe(503);
		outage.on = false;
		expect((await app.fetch(request)).status).toBe(200);
	});

	test('a renewal behind two session() is sent once', async () => {
		const { auth, clock } = setup();
		await auth.patient.signUp({ ...ada, password });
		const { token } = await auth.patient.signIn({ email: ada.email, password });
		const app = alxia()
			.use(session(auth))
			.use(session(auth, { required: true }))
			.get('/me', ({ reply }) => reply.ok('me'));
		clock.advance(2 * DAY);
		const renewed = await app.request('/me', {
			headers: { cookie: `janus-session=${token}` },
		});
		expect(
			renewed.headers
				.getSetCookie()
				.filter((value) => value.startsWith('janus-session=')),
		).toHaveLength(1);
	});

	test('auth.send sets the device cookie under the name session() gives', async () => {
		const key = Buffer.from(
			crypto.getRandomValues(new Uint8Array(32)),
		).toString('base64');
		const accounts = janus({
			user: z.object({ email: z.email(), name: z.string() }),
			password: { login: 'email' },
			store: createMemoryStores(),
			hasher: scryptHasher({ cost: 10 }),
			devices: { keys: [{ id: 'k1', key }] },
		});
		await accounts.signUp({ ...ada, password });
		const app = alxia()
			.use(session(accounts, { device: { name: 'my-device' } }))
			.post(
				'/signin',
				validate({
					body: z.object({ email: z.string(), password: z.string() }),
				}),
				async ({ body, auth, reply }) => {
					const signedIn = await accounts.signIn(body, { device: auth.device });
					return reply.ok({ id: auth.send(signedIn).id });
				},
			);
		const first = await app.request('/signin', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: ada.email, password }),
		});
		const device = first.headers
			.getSetCookie()
			.find((value) => value.startsWith('my-device='));
		expect(device).toContain('HttpOnly');
		expect(
			first.headers
				.getSetCookie()
				.some((value) => value.startsWith('janus-device=')),
		).toBe(false);
	});

	test('a renewed session is sent again, only to a cookie client', async () => {
		const { app, clock } = setup();
		const { token } = await signUp(app);
		clock.advance(2 * DAY);
		const viaCookie = await app.request('/me', {
			headers: { cookie: `janus-session=${token}` },
		});
		expect(cookieOf(viaCookie)).toBeDefined();
		clock.advance(2 * DAY);
		const viaBearer = await app.request('/me', {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(viaBearer.status).toBe(200);
		expect(cookieOf(viaBearer)).toBeUndefined();
	});

	test('sign-out revokes the session and clears the cookie', async () => {
		const { app } = setup();
		const { token } = await signUp(app);
		const out = await app.request('/signout', {
			method: 'POST',
			headers: { cookie: `janus-session=${token}` },
		});
		expect(await out.json()).toBe(true);
		expect(cookieOf(out)).toContain('Max-Age=0');
		expect(
			(
				await app.request('/me', {
					headers: { cookie: `janus-session=${token}` },
				})
			).status,
		).toBe(401);
	});

	test('an outage is a 503, never a 401', async () => {
		const { app, outage } = setup();
		const { token } = await signUp(app);
		outage.on = true;
		const response = await app.request('/me', {
			headers: { cookie: `janus-session=${token}` },
		});
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ code: 'STORE_FAILED' });
	});
});

describe('janusErrors', () => {
	test('refusals answered with their status and a safe body', async () => {
		const { app } = setup();
		await signUp(app);
		expect((await signUp(app)).response.status).toBe(409);
		const wrong = await app.request('/signin', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: ada.email, password: 'wrong password' }),
		});
		expect(wrong.status).toBe(401);
		expect(await wrong.json()).toEqual({ code: 'CREDENTIALS_INVALID' });
	});
});

describe('permission', () => {
	test('403 to a denial, 404 to nothing loaded, the object to an allowed subject', async () => {
		const { app, access, auth } = setup();
		const { token } = await signUp(app);
		const headers = { authorization: `Bearer ${token}` };
		expect((await app.request('/records/r1', { headers })).status).toBe(403);
		expect((await app.request('/records/gone', { headers })).status).toBe(404);
		const user = await auth.patient.findByLogin(ada.email);
		if (user === null) throw new Error('no user');
		await access.grant({ type: 'record', id: 'r1' }, 'owners', user);
		const allowed = await app.request('/records/r1', { headers });
		expect(await allowed.json()).toEqual({ title: 'Blood test' });
		expect((await app.request('/records/r1')).status).toBe(401);
	});

	test('subject, load and ctx read what an earlier plugin adds, typed by their parameters', async () => {
		const { access, auth } = setup();
		const user = await auth.patient.signUp({ ...ada, password });
		await access.grant({ type: 'record', id: 'r1' }, 'owners', user.user);
		interface Tenant {
			readonly records: ReadonlyMap<
				string,
				{ readonly id: string; readonly doctorId: string | null }
			>;
		}
		const tenant: Tenant = {
			records: new Map([['r1', { id: 'r1', doctorId: null }]]),
		};
		const edit = permission(
			access,
			'edit',
			'record',
			({ tenant: current, pathParams }: BaseContext & { tenant: Tenant }) =>
				current.records.get(pathParams['id'] ?? '') ?? null,
			{
				subject: ({ member }: { member: typeof user.user | null }) => member,
				ctx: ({ locked }: { locked: boolean }) => ({ locked }),
			},
		);
		expectTypeOf(edit['~requires']).toEqualTypeOf<{
			tenant: Tenant;
			member: typeof user.user | null;
			locked: boolean;
		}>();
		const app = alxia()
			.derive(({ request }) => ({
				tenant,
				member: request.headers.get('x-member') === 'ada' ? user.user : null,
				locked: request.headers.get('x-locked') === 'yes',
			}))
			.group('/records/:id', (records) =>
				records
					.use(edit)
					.get('/', ({ object, reply }) => reply(200, { id: object.id })),
			);
		const status = async (path: string, headers: Record<string, string>) =>
			(await app.request(path, { headers })).status;
		expect(await status('/records/r1', {})).toBe(401);
		expect(await status('/records/gone', { 'x-member': 'ada' })).toBe(404);
		expect(
			await status('/records/r1', { 'x-member': 'ada', 'x-locked': 'yes' }),
		).toBe(403);
		expect(await status('/records/r1', { 'x-member': 'ada' })).toBe(200);
	});

	test('unannotated callbacks read nothing more, and an app without what they read is refused', () => {
		const { access } = setup();
		const find = byParam('id', (id) => ({ id, doctorId: null }));
		expectTypeOf(
			permission(access, 'view', 'record', find, {
				subject: (ctx) => {
					expectTypeOf(ctx).toEqualTypeOf<BaseContext>();
					return null;
				},
			})['~requires'],
		).toEqualTypeOf<Empty>();
		const byMember = permission(access, 'view', 'record', find, {
			subject: ({ member }: { member: { type: 'patient'; id: string } }) =>
				member,
		});
		const _refused = () => {
			// @ts-expect-error the plugin reads "member", which this app's context does not give
			alxia().use(byMember);
			alxia()
				.derive(() => ({ member: 1 }))
				// @ts-expect-error the plugin reads "member", which this app's context gives with another type
				.use(byMember);
			const wrong = permission(
				access,
				'view',
				'record',
				({ pathParams }: { pathParams: string }) => ({
					id: pathParams,
					doctorId: null,
				}),
			);
			// @ts-expect-error the plugin reads "pathParams", which this app's context gives with another type
			alxia().use(wrong);
		};
		expect(_refused).toBeFunction();
	});

	test('load, subject or ctx annotated any is refused on every app, by its name', () => {
		const { access } = setup();
		const find = byParam('id', (id) => ({ id, doctorId: null }));
		const byLoad = permission(access, 'view', 'record', (ctx: any) => ({
			id: String(ctx.id),
			doctorId: null,
		}));
		const bySubject = permission(access, 'view', 'record', find, {
			subject: (ctx: any) => ctx.member,
		});
		const byCtx = permission(access, 'edit', 'record', find, {
			ctx: (ctx: any) => ({ locked: Boolean(ctx.locked) }),
		});
		type Message<Callback extends string> = {
			readonly '~any': `the plugin's ${Callback} reads its context as any: annotate what it reads, or leave it unannotated`;
		};
		expectTypeOf<(typeof byLoad)['~requires']>().toEqualTypeOf<
			Message<'load'>
		>();
		expectTypeOf<(typeof bySubject)['~requires']>().toEqualTypeOf<
			Message<'subject'>
		>();
		expectTypeOf<(typeof byCtx)['~requires']>().toEqualTypeOf<Message<'ctx'>>();
		const _refused = () => {
			// @ts-expect-error the plugin's load reads its context as any
			alxia().use(byLoad);
			// @ts-expect-error the plugin's subject reads its context as any
			alxia().use(bySubject);
			alxia()
				.derive(() => ({ locked: false }))
				// @ts-expect-error the plugin's ctx reads its context as any, whatever the app gives
				.use(byCtx);
		};
		expect(_refused).toBeFunction();
	});

	test('the permission, the type, the object and the condition stay inferred as before', () => {
		const { access } = setup();
		type Rec = { id: string; doctorId: string | null; title: string };
		const find = byParam('id', (id): Rec | null => ({
			id,
			doctorId: null,
			title: id,
		}));
		alxia()
			.use(
				permission(access, 'view', 'record', (ctx) => {
					expectTypeOf(ctx).toEqualTypeOf<BaseContext>();
					return { id: 'r1', doctorId: null, title: 'x' } as Rec | null;
				}),
			)
			.get('/', ({ object, reply }) => {
				expectTypeOf(object).toEqualTypeOf<Rec>();
				return reply(200, object.title);
			});
		permission(access, 'edit', 'record', find, {
			ctx: (ctx, object) => {
				expectTypeOf(ctx).toEqualTypeOf<BaseContext>();
				expectTypeOf(object).toEqualTypeOf<Rec>();
				return { locked: false };
			},
		});
		const _refused = () => {
			// @ts-expect-error a permission with a condition needs ctx
			permission(access, 'edit', 'record', find);
			permission(access, 'edit', 'record', find, {
				// @ts-expect-error the condition reads { locked: boolean }
				ctx: () => ({ locked: 'no' }),
			});
			permission(access, 'view', 'record', find, {
				// @ts-expect-error a permission without a condition takes no ctx
				ctx: () => ({ locked: false }),
			});
			// @ts-expect-error not a permission of record
			permission(access, 'delete', 'record', find);
			const noDoctor = byParam('id', (id) => ({ id }));
			// @ts-expect-error the object carries no doctorId, which a fromField reads
			permission(access, 'view', 'record', noDoctor);
		};
		expect(_refused).toBeFunction();
	});

	test('an annotated subject on the loose path is required too', () => {
		const { access } = setup();
		const anyPermission = 'view' as 'view' | 'edit' | 'owners' | 'doctors';
		const loose = permission(
			access,
			anyPermission,
			'record',
			byParam('id', (id) => ({ id, doctorId: null })),
			{
				subject: ({ member }: { member: { type: 'patient'; id: string } }) =>
					member,
				ctx: () => 1, // only the loose path takes any ctx
			},
		);
		expectTypeOf(loose['~requires']).toEqualTypeOf<{
			member: { type: 'patient'; id: string };
		}>();
		const _refused = () => {
			// @ts-expect-error the plugin reads "member", which this app's context does not give
			alxia().use(loose);
		};
		expect(_refused).toBeFunction();
	});

	test('the default subject is no requirement: without session() a request throws, a 500', async () => {
		const { access } = setup();
		const app = alxia().group('/records/:id', (records) =>
			records
				.use(
					permission(
						access,
						'view',
						'record',
						byParam('id', (id) => ({ id, doctorId: null })),
					),
				)
				.get('/', ({ object, reply }) => reply(200, object.id)),
		);
		const errors: unknown[] = [];
		const original = console.error;
		console.error = (...args: unknown[]) => errors.push(args);
		try {
			expect((await app.request('/records/r1')).status).toBe(500);
		} finally {
			console.error = original;
		}
		expect(String(errors.flat())).toContain('no user in the context');
	});
});
