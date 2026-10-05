/**
 * `app.all(path, options?, ...middlewares, handler)`: one route for every
 * method at a path — what a proxy, or a handler that reads the method
 * itself, is declared with — and `app.all(path, options?, end)`, the route
 * a middleware that answers ends: `proxy(url)`.
 *
 * It is a route like `get`'s, behind the same middlewares, typed by the same
 * `RouteMethod`, and listed in `app.routes` as `ALL`. Where its path has a
 * route of its own for a method, that route answers it: the explicit one
 * is the narrower declaration, as a literal segment wins over a parameter.
 * A `HEAD` goes to the path's `HEAD` route, else its `GET` (without a body),
 * else the `all` one, without a body too. Every other method reaches it, an
 * `OPTIONS` included, so the path never answers 405 (`routeAt`,
 * `router.ts`). A socket's upgrade does not: it needs a `ws` route.
 */
import { ALL } from '../router/router';
import type { JoinPath, PathAt, RoutePath } from '../types/path';
import type { Alxia } from './alxia';
import type { AppState } from './app-state';
import { addRoute } from './declare-routes';
import type { OptionsOnly, RouteOptions } from './route-forms';
import type { RouteMethod } from './route-method';
import type {
	MaybePromise,
	Method,
	MiddlewareBase,
	NextFunction,
} from './types';

/**
 * The middleware that ends an `all` route in place of a handler: it
 * answers with a `Response` of its own, as `proxy(url)` does, read from the
 * route's context; its `next()` answers 404, nothing being after it.
 */
export type AllEnd<Ctx extends object, Prefix extends string, Path> = (
	ctx: MiddlewareBase<Ctx, JoinPath<Prefix, Path & string>>,
	next: NextFunction,
) => MaybePromise<Response>;

/**
 * `app.all(path, options?, ...middlewares, handler)`, see `RouteMethod`,
 * and `app.all(path, options?, end)`, the route a middleware that answers
 * ends.
 */
export interface AllMethod<Ctx extends object, Prefix extends string>
	extends RouteMethod<Method, Ctx, Prefix> {
	/**
	 * A route for every method at `path`, ended by a middleware that
	 * answers, as `proxy(url)`: what runs before it is the chain in force,
	 * given to `use` before.
	 *
	 * ```ts
	 * app.use('/api', auth).all('/api/*', proxy('http://users.internal:8080', { rewrite: '/api' }));
	 * ```
	 */
	<const P extends RoutePath>(
		path: PathAt<Prefix, P>,
		end: AllEnd<Ctx, Prefix, P>,
	): Alxia<Ctx, Prefix>;
	/** The same, with the route's options: its `bodyLimit`, its `detail`. */
	<const P extends RoutePath, const B extends RouteOptions>(
		path: PathAt<Prefix, P>,
		options: OptionsOnly<B>,
		end: AllEnd<Ctx, Prefix, P>,
	): Alxia<Ctx, Prefix>;
}

/** `app.all(path, ...rest)`: `app[method](path, ...rest)` for every method. */
export function addAll(
	state: AppState,
	path: string,
	...rest: unknown[]
): void {
	addRoute(state, ALL, path, ...rest);
}
