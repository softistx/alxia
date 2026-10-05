/** The type of `ws`: a socket route, with options after its path or without. */
import type { RouteApp } from './route-method';
import type { SocketForms } from './socket-forms';
import type { SocketOptionsForms } from './socket-options';

/**
 * `app.ws(path, options?, ...middlewares, handlers)`, see `SocketForms`.
 * In the order of `RouteMethod`'s forms: the middleware forms last, where
 * a missing requirement is reported.
 */
export interface SocketMethod<Ctx extends object, Prefix extends string>
	extends SocketForms<RouteApp<'GET', Ctx, Prefix>>,
		SocketOptionsForms<RouteApp<'GET', Ctx, Prefix>> {}
