// The base, built with a middleware of its own: one that reads nothing of
// the registered context says so, or the base's type would read itself.
import { alxia, defineMiddleware, type Empty } from '@alxia/core';

const requestId = defineMiddleware<Empty>()((ctx, next) =>
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
