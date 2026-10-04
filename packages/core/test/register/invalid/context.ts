// The context rather than the app that builds it.
import {
	type AppContext,
	alxia,
	type ContextOf,
	defineRoutes,
} from '@alxia/core';

const base = alxia().derive(() => ({ user: { id: 'ada' } }));

declare module '@alxia/core' {
	interface Register {
		context: ContextOf<typeof base>;
	}
}

export const read = (ctx: AppContext) => ctx.user;
export const routes = defineRoutes().get('/', ({ user, reply }) =>
	reply(200, user.id),
);
