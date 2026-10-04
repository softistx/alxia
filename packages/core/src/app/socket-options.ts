/**
 * The middleware forms of `ws` with options first: `app.ws(path, { message,
 * send }, ...middlewares, handlers)`.
 */
import type { PathAt, RoutePath } from '../types/path';
import type { AppTypes, RouteStep } from './route-forms';
import type {
	AppWithSocket,
	SocketHandlersAfter,
	SocketOptions,
	SocketOptionsOnly,
} from './socket-forms';
import type { MiddlewareReturn } from './types';

/** `app.ws(path, options, ...middlewares, handlers)`: see `SocketForms`. */
export interface SocketOptionsForms<App extends AppTypes> {
	<const Path extends RoutePath, const Options extends SocketOptions>(
		path: PathAt<App['prefix'], Path>,
		options: SocketOptionsOnly<Options>,
		handlers: SocketHandlersAfter<App, Path, [], Options>,
	): AppWithSocket<App, Path, Options, []>;
	<
		const Path extends RoutePath,
		const Options extends SocketOptions,
		R1 extends MiddlewareReturn,
	>(
		path: PathAt<App['prefix'], Path>,
		options: SocketOptionsOnly<Options>,
		m1: RouteStep<App, Path, [], R1>,
		handlers: SocketHandlersAfter<App, Path, [R1], Options>,
	): AppWithSocket<App, Path, Options, [R1]>;
	<
		const Path extends RoutePath,
		const Options extends SocketOptions,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
	>(
		path: PathAt<App['prefix'], Path>,
		options: SocketOptionsOnly<Options>,
		m1: RouteStep<App, Path, [], R1>,
		m2: RouteStep<App, Path, [R1], R2>,
		handlers: SocketHandlersAfter<App, Path, [R1, R2], Options>,
	): AppWithSocket<App, Path, Options, [R1, R2]>;
	<
		const Path extends RoutePath,
		const Options extends SocketOptions,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
	>(
		path: PathAt<App['prefix'], Path>,
		options: SocketOptionsOnly<Options>,
		m1: RouteStep<App, Path, [], R1>,
		m2: RouteStep<App, Path, [R1], R2>,
		m3: RouteStep<App, Path, [R1, R2], R3>,
		handlers: SocketHandlersAfter<App, Path, [R1, R2, R3], Options>,
	): AppWithSocket<App, Path, Options, [R1, R2, R3]>;
	<
		const Path extends RoutePath,
		const Options extends SocketOptions,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
		R4 extends MiddlewareReturn,
	>(
		path: PathAt<App['prefix'], Path>,
		options: SocketOptionsOnly<Options>,
		m1: RouteStep<App, Path, [], R1>,
		m2: RouteStep<App, Path, [R1], R2>,
		m3: RouteStep<App, Path, [R1, R2], R3>,
		m4: RouteStep<App, Path, [R1, R2, R3], R4>,
		handlers: SocketHandlersAfter<App, Path, [R1, R2, R3, R4], Options>,
	): AppWithSocket<App, Path, Options, [R1, R2, R3, R4]>;
	<
		const Path extends RoutePath,
		const Options extends SocketOptions,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
		R4 extends MiddlewareReturn,
		R5 extends MiddlewareReturn,
	>(
		path: PathAt<App['prefix'], Path>,
		options: SocketOptionsOnly<Options>,
		m1: RouteStep<App, Path, [], R1>,
		m2: RouteStep<App, Path, [R1], R2>,
		m3: RouteStep<App, Path, [R1, R2], R3>,
		m4: RouteStep<App, Path, [R1, R2, R3], R4>,
		m5: RouteStep<App, Path, [R1, R2, R3, R4], R5>,
		handlers: SocketHandlersAfter<App, Path, [R1, R2, R3, R4, R5], Options>,
	): AppWithSocket<App, Path, Options, [R1, R2, R3, R4, R5]>;
	<
		const Path extends RoutePath,
		const Options extends SocketOptions,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
		R4 extends MiddlewareReturn,
		R5 extends MiddlewareReturn,
		R6 extends MiddlewareReturn,
	>(
		path: PathAt<App['prefix'], Path>,
		options: SocketOptionsOnly<Options>,
		m1: RouteStep<App, Path, [], R1>,
		m2: RouteStep<App, Path, [R1], R2>,
		m3: RouteStep<App, Path, [R1, R2], R3>,
		m4: RouteStep<App, Path, [R1, R2, R3], R4>,
		m5: RouteStep<App, Path, [R1, R2, R3, R4], R5>,
		m6: RouteStep<App, Path, [R1, R2, R3, R4, R5], R6>,
		handlers: SocketHandlersAfter<App, Path, [R1, R2, R3, R4, R5, R6], Options>,
	): AppWithSocket<App, Path, Options, [R1, R2, R3, R4, R5, R6]>;
	<
		const Path extends RoutePath,
		const Options extends SocketOptions,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
		R4 extends MiddlewareReturn,
		R5 extends MiddlewareReturn,
		R6 extends MiddlewareReturn,
		R7 extends MiddlewareReturn,
	>(
		path: PathAt<App['prefix'], Path>,
		options: SocketOptionsOnly<Options>,
		m1: RouteStep<App, Path, [], R1>,
		m2: RouteStep<App, Path, [R1], R2>,
		m3: RouteStep<App, Path, [R1, R2], R3>,
		m4: RouteStep<App, Path, [R1, R2, R3], R4>,
		m5: RouteStep<App, Path, [R1, R2, R3, R4], R5>,
		m6: RouteStep<App, Path, [R1, R2, R3, R4, R5], R6>,
		m7: RouteStep<App, Path, [R1, R2, R3, R4, R5, R6], R7>,
		handlers: SocketHandlersAfter<
			App,
			Path,
			[R1, R2, R3, R4, R5, R6, R7],
			Options
		>,
	): AppWithSocket<App, Path, Options, [R1, R2, R3, R4, R5, R6, R7]>;
	<
		const Path extends RoutePath,
		const Options extends SocketOptions,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
		R4 extends MiddlewareReturn,
		R5 extends MiddlewareReturn,
		R6 extends MiddlewareReturn,
		R7 extends MiddlewareReturn,
		R8 extends MiddlewareReturn,
	>(
		path: PathAt<App['prefix'], Path>,
		options: SocketOptionsOnly<Options>,
		m1: RouteStep<App, Path, [], R1>,
		m2: RouteStep<App, Path, [R1], R2>,
		m3: RouteStep<App, Path, [R1, R2], R3>,
		m4: RouteStep<App, Path, [R1, R2, R3], R4>,
		m5: RouteStep<App, Path, [R1, R2, R3, R4], R5>,
		m6: RouteStep<App, Path, [R1, R2, R3, R4, R5], R6>,
		m7: RouteStep<App, Path, [R1, R2, R3, R4, R5, R6], R7>,
		m8: RouteStep<App, Path, [R1, R2, R3, R4, R5, R6, R7], R8>,
		handlers: SocketHandlersAfter<
			App,
			Path,
			[R1, R2, R3, R4, R5, R6, R7, R8],
			Options
		>,
	): AppWithSocket<App, Path, Options, [R1, R2, R3, R4, R5, R6, R7, R8]>;
}
