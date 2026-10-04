/**
 * The middleware form of a route method, with options first:
 * `app.post(path, { bodyLimit }, ...middlewares, handler)`.
 */
import type { PathAt, RoutePath } from '../types/path';
import type {
	AppTypes,
	AppWithRoute,
	OptionsOnly,
	RouteHandler,
	RouteMiddleware,
	RouteOptions,
	RouteResult,
} from './route-forms';
import type { MiddlewareReturn } from './types';

/**
 * `app.post(path, options, ...middlewares, handler)`: the middleware form
 * with the route's options — its `bodyLimit`, its `detail` — first. The
 * options hold no schema: that is `validate(…)` and `responds(…)`.
 *
 * ```ts
 * app.post('/upload', { bodyLimit: 25 * 1024 * 1024 }, auth, ({ request, reply }) =>
 *   reply(202, { queued: true }));
 * ```
 */
export interface OptionsForms<App extends AppTypes> {
	<
		const Path extends RoutePath,
		const Options extends RouteOptions,
		Result extends RouteResult<[]>,
	>(
		path: PathAt<App['prefix'], Path>,
		options: OptionsOnly<Options>,
		handler: RouteHandler<App, Path, [], Result>,
	): AppWithRoute<App>;
	<
		const Path extends RoutePath,
		const Options extends RouteOptions,
		R1 extends MiddlewareReturn,
		Result extends RouteResult<[R1]>,
	>(
		path: PathAt<App['prefix'], Path>,
		options: OptionsOnly<Options>,
		m1: RouteMiddleware<App, Path, [], R1>,
		handler: RouteHandler<App, Path, [R1], Result>,
	): AppWithRoute<App>;
	<
		const Path extends RoutePath,
		const Options extends RouteOptions,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		Result extends RouteResult<[R1, R2]>,
	>(
		path: PathAt<App['prefix'], Path>,
		options: OptionsOnly<Options>,
		m1: RouteMiddleware<App, Path, [], R1>,
		m2: RouteMiddleware<App, Path, [R1], R2>,
		handler: RouteHandler<App, Path, [R1, R2], Result>,
	): AppWithRoute<App>;
	<
		const Path extends RoutePath,
		const Options extends RouteOptions,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
		Result extends RouteResult<[R1, R2, R3]>,
	>(
		path: PathAt<App['prefix'], Path>,
		options: OptionsOnly<Options>,
		m1: RouteMiddleware<App, Path, [], R1>,
		m2: RouteMiddleware<App, Path, [R1], R2>,
		m3: RouteMiddleware<App, Path, [R1, R2], R3>,
		handler: RouteHandler<App, Path, [R1, R2, R3], Result>,
	): AppWithRoute<App>;
	<
		const Path extends RoutePath,
		const Options extends RouteOptions,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
		R4 extends MiddlewareReturn,
		Result extends RouteResult<[R1, R2, R3, R4]>,
	>(
		path: PathAt<App['prefix'], Path>,
		options: OptionsOnly<Options>,
		m1: RouteMiddleware<App, Path, [], R1>,
		m2: RouteMiddleware<App, Path, [R1], R2>,
		m3: RouteMiddleware<App, Path, [R1, R2], R3>,
		m4: RouteMiddleware<App, Path, [R1, R2, R3], R4>,
		handler: RouteHandler<App, Path, [R1, R2, R3, R4], Result>,
	): AppWithRoute<App>;
	<
		const Path extends RoutePath,
		const Options extends RouteOptions,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
		R4 extends MiddlewareReturn,
		R5 extends MiddlewareReturn,
		Result extends RouteResult<[R1, R2, R3, R4, R5]>,
	>(
		path: PathAt<App['prefix'], Path>,
		options: OptionsOnly<Options>,
		m1: RouteMiddleware<App, Path, [], R1>,
		m2: RouteMiddleware<App, Path, [R1], R2>,
		m3: RouteMiddleware<App, Path, [R1, R2], R3>,
		m4: RouteMiddleware<App, Path, [R1, R2, R3], R4>,
		m5: RouteMiddleware<App, Path, [R1, R2, R3, R4], R5>,
		handler: RouteHandler<App, Path, [R1, R2, R3, R4, R5], Result>,
	): AppWithRoute<App>;
	<
		const Path extends RoutePath,
		const Options extends RouteOptions,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
		R4 extends MiddlewareReturn,
		R5 extends MiddlewareReturn,
		R6 extends MiddlewareReturn,
		Result extends RouteResult<[R1, R2, R3, R4, R5, R6]>,
	>(
		path: PathAt<App['prefix'], Path>,
		options: OptionsOnly<Options>,
		m1: RouteMiddleware<App, Path, [], R1>,
		m2: RouteMiddleware<App, Path, [R1], R2>,
		m3: RouteMiddleware<App, Path, [R1, R2], R3>,
		m4: RouteMiddleware<App, Path, [R1, R2, R3], R4>,
		m5: RouteMiddleware<App, Path, [R1, R2, R3, R4], R5>,
		m6: RouteMiddleware<App, Path, [R1, R2, R3, R4, R5], R6>,
		handler: RouteHandler<App, Path, [R1, R2, R3, R4, R5, R6], Result>,
	): AppWithRoute<App>;
	<
		const Path extends RoutePath,
		const Options extends RouteOptions,
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
		options: OptionsOnly<Options>,
		m1: RouteMiddleware<App, Path, [], R1>,
		m2: RouteMiddleware<App, Path, [R1], R2>,
		m3: RouteMiddleware<App, Path, [R1, R2], R3>,
		m4: RouteMiddleware<App, Path, [R1, R2, R3], R4>,
		m5: RouteMiddleware<App, Path, [R1, R2, R3, R4], R5>,
		m6: RouteMiddleware<App, Path, [R1, R2, R3, R4, R5], R6>,
		m7: RouteMiddleware<App, Path, [R1, R2, R3, R4, R5, R6], R7>,
		handler: RouteHandler<App, Path, [R1, R2, R3, R4, R5, R6, R7], Result>,
	): AppWithRoute<App>;
	<
		const Path extends RoutePath,
		const Options extends RouteOptions,
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
		options: OptionsOnly<Options>,
		m1: RouteMiddleware<App, Path, [], R1>,
		m2: RouteMiddleware<App, Path, [R1], R2>,
		m3: RouteMiddleware<App, Path, [R1, R2], R3>,
		m4: RouteMiddleware<App, Path, [R1, R2, R3], R4>,
		m5: RouteMiddleware<App, Path, [R1, R2, R3, R4], R5>,
		m6: RouteMiddleware<App, Path, [R1, R2, R3, R4, R5], R6>,
		m7: RouteMiddleware<App, Path, [R1, R2, R3, R4, R5, R6], R7>,
		m8: RouteMiddleware<App, Path, [R1, R2, R3, R4, R5, R6, R7], R8>,
		handler: RouteHandler<App, Path, [R1, R2, R3, R4, R5, R6, R7, R8], Result>,
	): AppWithRoute<App>;
}
