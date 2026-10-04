// A route file: it reads the registered context, and imports no app.
import {
	type AppContext,
	alxia,
	defineMiddleware,
	defineRoutes,
} from '@alxia/core';

/** A service: typed by the registered context. */
export function greet({ greeting, user }: AppContext): string {
	return `${greeting} ${user.id}`;
}

/** Requires the registered context explicitly, checked where it is used. */
export const owner = defineMiddleware<AppContext>()(({ user }, next) =>
	next({ owner: user.id }),
);

export const todos = defineRoutes('/todos')
	.use(owner)
	.get('/', (ctx) => ctx.reply(200, { text: greet(ctx), owner: ctx.owner }));

// @ts-expect-error: an app with no `user` cannot mount the routes
alxia().use(todos);

// @ts-expect-error: nor return them from a plugin function
alxia().use(() => todos);

// @ts-expect-error: nor from a group
alxia().group(() => todos);

// @ts-expect-error: nor from a group under a path
alxia().group('/g', () => todos);

defineRoutes().get('/', (ctx) => {
	// @ts-expect-error: the requirement it carries is nothing to read
	void ctx['~requires'].user;
	return ctx.reply(200, 'x');
});

// @ts-expect-error: nor run the middleware that reads it
alxia().get('/', owner, ({ reply }) => reply(200, 'x'));

// A middleware with no requirement reads the base context alone.
defineMiddleware((ctx, next) => {
	// @ts-expect-error: it may run before the base gives `user`
	void ctx.user;
	return next();
});
