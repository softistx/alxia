// An app behind sessions and permissions, behind exported functions whose
// return types are inferred: a declaration build must be able to name each
// one through `@alxia/janus`, `@alxia/core` and `@nxgt/janus` alone (TS2883
// otherwise).
import { alxia } from '@alxia/core';
import {
	type Auth,
	byParam,
	janusErrors,
	permission,
	sendSession,
	session,
	signOut,
} from '@alxia/janus';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import {
	createMemoryRelations,
	defineModel,
	permissions,
	when,
} from '@nxgt/janus/permissions';
import { z } from 'zod';

const auth = janus({
	users: {
		patient: {
			schema: z.strictObject({ email: z.email(), name: z.string() }),
			password: { login: 'email' },
		},
		staff: {
			schema: z.strictObject({ username: z.string() }),
			password: { login: 'username' },
		},
	},
	store: createMemoryStores(),
	hasher: scryptHasher({ cost: 10 }),
});

const model = defineModel({
	subjects: auth.types,
	types: {
		record: {
			related: { owners: ['patient'] },
			permits: {
				view: ['owners'],
				edit: [when('owners', (ctx: { locked: boolean }) => !ctx.locked)],
			},
		},
	},
});
const access = permissions({ model, store: createMemoryRelations() });
const find = (id: string) => (id === 'r1' ? { id, title: 'Blood test' } : null);

export function signingIn() {
	return alxia()
		.use(janusErrors())
		.post(
			'/signin',
			{ body: z.object({ email: z.string(), password: z.string() }) },
			async (ctx) => {
				const signedIn = await auth.patient.signIn(ctx.body);
				return ctx.reply(200, { id: sendSession(ctx, auth, signedIn).id });
			},
		)
		.post('/signout', async (ctx) => ctx.reply(200, await signOut(ctx, auth)));
}

export function required() {
	return alxia()
		.use(session(auth, { type: 'patient', required: true }))
		.get('/me', ({ user, auth: bound, reply }) =>
			reply(200, { name: user.name, device: bound.device }),
		);
}

export function optional() {
	return alxia()
		.use(session(auth))
		.get('/me', ({ user, session: current, reply }) =>
			reply(200, { type: user?.type ?? null, expires: current?.expiresAt }),
		);
}

export function guarded() {
	return alxia()
		.use(session(auth, { required: true }))
		.group('/records/:id', (records) =>
			records
				.use(permission(access, 'view', 'record', byParam('id', find)))
				.get('/', ({ object, reply }) => reply(200, { title: object.title })),
		);
}

export function guardedWithCtx() {
	return alxia()
		.use(session(auth, { required: true }))
		.group('/records/:id', (records) =>
			records
				.use(
					permission(access, 'edit', 'record', byParam('id', find), {
						ctx: () => ({ locked: false }),
					}),
				)
				.put('/', ({ object, reply }) => reply(200, object.id)),
		);
}

export function sessionOf<A extends Auth<{ readonly type: string }>>(
	accounts: A,
) {
	return alxia()
		.use(session(accounts, { required: true }))
		.get('/me', ({ user, reply }) => reply(200, user.type));
}
