/**
 * The type of a route method — `get`, `post`, … — in its two forms: with
 * options after the path, or without.
 */
import type { AppTypes } from './route-forms';
import type { MiddlewareForms } from './route-middlewares';
import type { OptionsForms } from './route-options';
import type { Method } from './types';

/**
 * A route method: `app.get(path, options?, ...middlewares, handler)`, see
 * `MiddlewareForms` and `OptionsForms`. The options forms come first, the
 * middleware forms last: a middleware the route's context does not give is
 * reported on them, naming the key it reads.
 */
export interface RouteMethod<
	M extends Method,
	Ctx extends object,
	Prefix extends string,
> extends MiddlewareForms<RouteApp<M, Ctx, Prefix>>,
		OptionsForms<RouteApp<M, Ctx, Prefix>> {}

/** The types of an app and a method, as the middleware forms read them. */
export interface RouteApp<
	M extends Method,
	Ctx extends object,
	Prefix extends string,
> extends AppTypes {
	readonly method: M;
	readonly ctx: Ctx;
	readonly prefix: Prefix;
}
