import { type AppContext, defineMiddleware, defineRoutes } from '@alxia/core';

// ctx.env, typed, in a route file that imports no app
export const routes = defineRoutes().get('/port', ({ env, reply }) => {
	const port: number = env.PORT;
	const dsn: string | undefined = env.SENTRY_DSN;
	// @ts-expect-error a variable the schema does not declare
	env.NOPE;
	return reply(200, `${port}${dsn}`);
});

export const around = defineMiddleware<AppContext>()(async ({ env }, next) => {
	const port: number = env.PORT;
	return next({ port });
});
