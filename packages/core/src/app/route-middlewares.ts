/**
 * The middleware form of a route method, without options:
 * `app.get(path, ...middlewares, handler)`, up to 8 middlewares, each
 * reading what the ones before it added.
 */
import type { PathAt, RoutePath } from '../types/path';
import type { FormSlots } from './forms';
import type { Bare, Ladder } from './ladder';
import type {
	AppTypes,
	AppWithRoute,
	RouteHandler,
	RouteMiddleware,
	RouteResult,
} from './route-forms';

declare module './forms' {
	interface Forms<
		App extends AppTypes,
		A,
		B,
		Results extends readonly unknown[],
		Result,
		Handled,
	> {
		readonly route: RouteForm<App, A, Results, Result, Handled>;
	}
}

/**
 * `app.get(path, ...middlewares, handler)`: each middleware reads the
 * context of the route at the path `A`. Its slots are written out, not
 * inherited: an interface's bases cost each call an instantiation more.
 */
export interface RouteForm<
	App extends AppTypes,
	A,
	Results extends readonly unknown[],
	Result,
	Handled,
> extends FormSlots {
	readonly aBound: RoutePath;
	readonly handledBound: RouteResult<Results>;
	readonly head: [path: PathAt<App['prefix'], A & string>];
	readonly step: RouteMiddleware<App, A & string, Results, Result>;
	readonly tail: [handler: RouteHandler<App, A & string, Results, Handled>];
	readonly out: AppWithRoute<App>;
}

/**
 * `app.get(path, ...middlewares, handler)`: each middleware reads the
 * context the ones before it built and returns `next(added)`, a reply or
 * a `Response`; the handler, last, returns the route's reply.
 *
 * ```ts
 * app.post('/posts', auth, validate({ body: Post }), ({ user, body, reply }) =>
 *   reply(201, { id: create(user, body) }));
 * ```
 */
export interface MiddlewareForms<App extends AppTypes>
	extends Bare<'route', App>,
		Ladder<'route', App> {}
