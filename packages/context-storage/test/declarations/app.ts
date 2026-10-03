// An app behind the context storage, behind exported functions whose return
// types are inferred: a declaration build must be able to name each one
// through `@alxia/context-storage` and `@alxia/core` alone (TS2883
// otherwise).
import { contextStorage, getContext } from '@alxia/context-storage';
import { alxia } from '@alxia/core';

const base = alxia()
	.decorate({ db: { orders: ['o1'] } })
	.derive(() => ({ user: { id: 'u' } }));
const requestContext = contextStorage<typeof base>();

export function stored() {
	return base.use(requestContext).get('/orders', ({ reply }) => {
		const { db, user } = requestContext.context();
		return reply(200, { orders: db.orders, user: user.id });
	});
}

export function storage() {
	return requestContext;
}

export function untyped() {
	return alxia()
		.use(contextStorage())
		.get('/', ({ reply }) => reply(200, getContext<{ user: string }>().user));
}

export function storageOf<App>() {
	return contextStorage<App>();
}
