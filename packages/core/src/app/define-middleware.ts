/**
 * `defineMiddleware`: a middleware written once, typed, and given to as
 * many routes as read it.
 */
import type { RegisteredContext } from './register';
import type { Middleware, MiddlewareReturn, NoMiddlewareYet } from './types';

/**
 * A middleware: `(ctx, next) => …`, given to a route after its path, or
 * its options:
 *
 * ```ts
 * const auth = defineMiddleware(async (ctx, next) => {
 *   const user = await session(ctx.request);
 *   if (!user) return ctx.reply(401, { error: 'unauthorized' as const });
 *   return next({ user });
 * });
 * app.get('/me', auth, ({ user, reply }) => reply(200, user));
 * ```
 *
 * What it returns is its type: `next(added)` passes `added` on to the
 * middlewares after it and to the handler, which read it typed; a reply
 * ends the request there, and joins the route's type; a `Response` is
 * sent as it is. `next()` resolves to the response of the rest of the
 * route, so a middleware that awaits it runs around them:
 *
 * ```ts
 * const timed = defineMiddleware(async (_ctx, next) => {
 *   const started = performance.now();
 *   const response = await next();
 *   response.headers.set('server-timing', `app;dur=${performance.now() - started}`);
 *   return response;
 * });
 * ```
 *
 * Given nothing, it takes what the middleware reads beyond the base
 * context — a `user` an earlier middleware adds, the path parameters —
 * then the middleware; a route whose context does not give it is a
 * compile error:
 *
 * ```ts
 * const canView = defineMiddleware<{ user: User; pathParams: { id: string } }>()(
 *   async ({ user, pathParams, reply }, next) =>
 *     (await mayView(user, pathParams.id)) ? next() : reply(403, { error: 'forbidden' as const }),
 * );
 * ```
 *
 * Given a middleware alone, it reads the `Register`ed context — the `db`,
 * the `env`, the `user` the registered base gives — as `defineRoutes` and
 * `AppContext` do, and is refused on a route whose context does not give
 * it; nothing registered, the base context alone. `Requires`, given, is
 * read instead: `defineMiddleware<Empty>()(fn)` for one that reads nothing
 * of it, such as one the registered base itself is built with.
 *
 * The middleware is the function itself: `use`, a route and `ws` take a
 * plain `(ctx, next)` function as well, written inline, its additions
 * read from what it returns. `defineMiddleware` gives a shared one its
 * type: what it reads and what it returns.
 */
export function defineMiddleware<
	Requires extends object = RegisteredContext,
	Result extends MiddlewareReturn | NoMiddlewareYet = NoMiddlewareYet,
>(
	middleware?: Middleware<Requires, Result>,
): NoInfer<
	0 extends 1 & Result
		? Middleware<Requires, Result>
		: [Result] extends [NoMiddlewareYet]
			? [NoMiddlewareYet] extends [Result]
				? <Returned extends MiddlewareReturn>(
						middleware: Middleware<Requires, Returned>,
					) => Middleware<Requires, Returned>
				: Middleware<Requires, Result>
			: Middleware<Requires, Result>
> {
	if (middleware === undefined) return checked as never;
	return checked(middleware) as never;
}

function checked<Fn>(middleware: Fn): Fn {
	if (typeof middleware !== 'function') {
		throw new TypeError('defineMiddleware(): the middleware is not a function');
	}
	return middleware;
}
