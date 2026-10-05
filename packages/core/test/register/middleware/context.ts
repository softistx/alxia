// The base, built with a middleware of its own: `defineMiddleware(fn)`
// reads the base context alone, so the base's type never reads itself.
import { alxia, defineMiddleware } from '@alxia/core';

const requestId = defineMiddleware((ctx, next) =>
	next({ requestId: ctx.request.headers.get('x-request-id') ?? 'none' }),
);

export const base = alxia()
	.decorate({ db: { find: (id: string) => ({ id, name: 'Ada' }) } })
	.use(requestId)
	.derive(({ request }) => ({
		user: { id: request.headers.get('x-user') ?? '' },
	}));

declare module '@alxia/core' {
	interface Register {
		context: typeof base;
	}
}
