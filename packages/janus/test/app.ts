/** The app the janus specs share: two user types, a record model, a session and a permission, and the hands to sign up. */
import { expectTypeOf } from 'bun:test';
import { alxia, type Middleware, validate } from '@alxia/core';
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
import { janusErrors } from '../src/errors';
import { byParam, permission } from '../src/permission';
import { sendSession, signOut } from '../src/send';
import { session } from '../src/session';

/** What a middleware requires of the app that uses it: what its context reads beyond the base. */
export type Reads<M> =
	M extends Middleware<infer Requires, infer _Result> ? Requires : never;
export const reads = <M>(_middleware: M) => undefined as unknown as Reads<M>;

export const ada = { email: 'ada@example.test', name: 'Ada Lovelace' };
export const password = 'correct horse';
export const DAY = 86_400_000;

/** Two user types on memory stores and a fixed clock; `outage.on` makes every session lookup throw. */
export function authOf() {
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
	return { auth, clock, outage };
}

/** Who may view and edit a record: its owners, its doctor. */
function accessOf(auth: ReturnType<typeof authOf>['auth']) {
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
	return permissions({ model, store: createMemoryRelations() });
}

export function setup() {
	const { auth, clock, outage } = authOf();
	const access = accessOf(auth);
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

export const cookieOf = (response: Response) =>
	response.headers
		.getSetCookie()
		.find((value) => value.startsWith('janus-session='));
export const tokenOf = (response: Response) =>
	cookieOf(response)?.split(';')[0]?.split('=')[1] ?? '';

export async function signUp(app: ReturnType<typeof setup>['app']) {
	const response = await app.request('/signup', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ ...ada, password }),
	});
	return { response, token: tokenOf(response) };
}
