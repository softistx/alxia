/**
 * The middleware form of a route method, without options:
 * `app.get(path, ...middlewares, handler)`, up to 8 middlewares, each
 * reading what the ones before it added.
 */
import type { PathAt, RoutePath } from '../types/path';
import type {
	AppTypes,
	AppWithRoute,
	RouteHandler,
	RouteResult,
	RouteStep,
} from './route-forms';
import type { Empty, MiddlewareReturn } from './types';

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
export interface MiddlewareForms<App extends AppTypes> {
	/** A route with its handler alone. */
	<const Path extends RoutePath, Result extends RouteResult<[]>>(
		path: PathAt<App['prefix'], Path>,
		handler: RouteHandler<App, Path, [], Result>,
	): AppWithRoute<App, Path, Empty, [], Result>;
	<
		const Path extends RoutePath,
		R1 extends MiddlewareReturn,
		Result extends RouteResult<[R1]>,
	>(
		path: PathAt<App['prefix'], Path>,
		m1: RouteStep<App, Path, [], R1>,
		handler: RouteHandler<App, Path, [R1], Result>,
	): AppWithRoute<App, Path, Empty, [R1], Result>;
	<
		const Path extends RoutePath,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		Result extends RouteResult<[R1, R2]>,
	>(
		path: PathAt<App['prefix'], Path>,
		m1: RouteStep<App, Path, [], R1>,
		m2: RouteStep<App, Path, [R1], R2>,
		handler: RouteHandler<App, Path, [R1, R2], Result>,
	): AppWithRoute<App, Path, Empty, [R1, R2], Result>;
	<
		const Path extends RoutePath,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
		Result extends RouteResult<[R1, R2, R3]>,
	>(
		path: PathAt<App['prefix'], Path>,
		m1: RouteStep<App, Path, [], R1>,
		m2: RouteStep<App, Path, [R1], R2>,
		m3: RouteStep<App, Path, [R1, R2], R3>,
		handler: RouteHandler<App, Path, [R1, R2, R3], Result>,
	): AppWithRoute<App, Path, Empty, [R1, R2, R3], Result>;
	<
		const Path extends RoutePath,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
		R4 extends MiddlewareReturn,
		Result extends RouteResult<[R1, R2, R3, R4]>,
	>(
		path: PathAt<App['prefix'], Path>,
		m1: RouteStep<App, Path, [], R1>,
		m2: RouteStep<App, Path, [R1], R2>,
		m3: RouteStep<App, Path, [R1, R2], R3>,
		m4: RouteStep<App, Path, [R1, R2, R3], R4>,
		handler: RouteHandler<App, Path, [R1, R2, R3, R4], Result>,
	): AppWithRoute<App, Path, Empty, [R1, R2, R3, R4], Result>;
	<
		const Path extends RoutePath,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
		R4 extends MiddlewareReturn,
		R5 extends MiddlewareReturn,
		Result extends RouteResult<[R1, R2, R3, R4, R5]>,
	>(
		path: PathAt<App['prefix'], Path>,
		m1: RouteStep<App, Path, [], R1>,
		m2: RouteStep<App, Path, [R1], R2>,
		m3: RouteStep<App, Path, [R1, R2], R3>,
		m4: RouteStep<App, Path, [R1, R2, R3], R4>,
		m5: RouteStep<App, Path, [R1, R2, R3, R4], R5>,
		handler: RouteHandler<App, Path, [R1, R2, R3, R4, R5], Result>,
	): AppWithRoute<App, Path, Empty, [R1, R2, R3, R4, R5], Result>;
	<
		const Path extends RoutePath,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
		R4 extends MiddlewareReturn,
		R5 extends MiddlewareReturn,
		R6 extends MiddlewareReturn,
		Result extends RouteResult<[R1, R2, R3, R4, R5, R6]>,
	>(
		path: PathAt<App['prefix'], Path>,
		m1: RouteStep<App, Path, [], R1>,
		m2: RouteStep<App, Path, [R1], R2>,
		m3: RouteStep<App, Path, [R1, R2], R3>,
		m4: RouteStep<App, Path, [R1, R2, R3], R4>,
		m5: RouteStep<App, Path, [R1, R2, R3, R4], R5>,
		m6: RouteStep<App, Path, [R1, R2, R3, R4, R5], R6>,
		handler: RouteHandler<App, Path, [R1, R2, R3, R4, R5, R6], Result>,
	): AppWithRoute<App, Path, Empty, [R1, R2, R3, R4, R5, R6], Result>;
	<
		const Path extends RoutePath,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
		R4 extends MiddlewareReturn,
		R5 extends MiddlewareReturn,
		R6 extends MiddlewareReturn,
		R7 extends MiddlewareReturn,
		Result extends RouteResult<[R1, R2, R3, R4, R5, R6, R7]>,
	>(
		path: PathAt<App['prefix'], Path>,
		m1: RouteStep<App, Path, [], R1>,
		m2: RouteStep<App, Path, [R1], R2>,
		m3: RouteStep<App, Path, [R1, R2], R3>,
		m4: RouteStep<App, Path, [R1, R2, R3], R4>,
		m5: RouteStep<App, Path, [R1, R2, R3, R4], R5>,
		m6: RouteStep<App, Path, [R1, R2, R3, R4, R5], R6>,
		m7: RouteStep<App, Path, [R1, R2, R3, R4, R5, R6], R7>,
		handler: RouteHandler<App, Path, [R1, R2, R3, R4, R5, R6, R7], Result>,
	): AppWithRoute<App, Path, Empty, [R1, R2, R3, R4, R5, R6, R7], Result>;
	<
		const Path extends RoutePath,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
		R4 extends MiddlewareReturn,
		R5 extends MiddlewareReturn,
		R6 extends MiddlewareReturn,
		R7 extends MiddlewareReturn,
		R8 extends MiddlewareReturn,
		Result extends RouteResult<[R1, R2, R3, R4, R5, R6, R7, R8]>,
	>(
		path: PathAt<App['prefix'], Path>,
		m1: RouteStep<App, Path, [], R1>,
		m2: RouteStep<App, Path, [R1], R2>,
		m3: RouteStep<App, Path, [R1, R2], R3>,
		m4: RouteStep<App, Path, [R1, R2, R3], R4>,
		m5: RouteStep<App, Path, [R1, R2, R3, R4], R5>,
		m6: RouteStep<App, Path, [R1, R2, R3, R4, R5], R6>,
		m7: RouteStep<App, Path, [R1, R2, R3, R4, R5, R6], R7>,
		m8: RouteStep<App, Path, [R1, R2, R3, R4, R5, R6, R7], R8>,
		handler: RouteHandler<App, Path, [R1, R2, R3, R4, R5, R6, R7, R8], Result>,
	): AppWithRoute<App, Path, Empty, [R1, R2, R3, R4, R5, R6, R7, R8], Result>;
}
