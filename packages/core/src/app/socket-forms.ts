/**
 * The middleware forms of `ws`: `app.ws(path, options?, ...middlewares,
 * handlers)`, up to 8 middlewares run on the upgrade request.
 */
import type { StandardSchemaV1 } from '../schema/standard-schema';
import type { JoinPath, PathAt, RoutePath } from '../types/path';
import type {
	SocketEntryOf,
	SocketHandlers,
	SocketMessage,
	SocketSend,
} from '../ws/types';
import type { Alxia } from './alxia';
import type {
	AppTypes,
	NotAFunction,
	RouteBase,
	RouteStep,
} from './route-forms';
import type {
	Empty,
	MiddlewareReturn,
	RouteDetail,
	ThreadContext,
	ThreadSchema,
} from './types';

/**
 * A socket route's options: the schema of each message the client sends,
 * and of each one the server sends. Its request's are `validate(…)`'s.
 */
export interface SocketOptions {
	/** Each message the client sends, as JSON. A refused one is answered with the issues, the socket kept open. */
	readonly message?: StandardSchemaV1;
	/** Each message the server sends: checked, then sent as its output. */
	readonly send?: StandardSchemaV1;
	readonly detail?: RouteDetail;
}

/** `Options`, with no schema of the request in it: that is a `validate` middleware. */
export type SocketOptionsOnly<Options> = Options &
	NotAFunction & {
		readonly [Key in 'params' | 'query' | 'headers' | 'cookies']?: never;
	};

/** What a socket's handlers read as `socket.data`, after the middlewares that returned `Results`. */
export type SocketDataAfter<
	App extends AppTypes,
	Path extends string,
	Results extends readonly unknown[],
> = Omit<
	ThreadContext<RouteBase<App, Path>, Results>,
	'reply' | 'redirect' | 'set' | 'body'
>;

/** The handlers of a socket route, after the middlewares that returned `Results`. */
export type SocketHandlersAfter<
	App extends AppTypes,
	Path extends string,
	Results extends readonly unknown[],
	Options,
> = SocketHandlers<
	SocketDataAfter<App, Path, Results>,
	SocketSend<Options>,
	SocketMessage<Options>
>;

/** `App` with the socket route at `Path` added to its table. */
export type AppWithSocket<
	App extends AppTypes,
	Path extends string,
	Options,
	Results extends readonly unknown[],
> = Alxia<
	App['ctx'],
	App['routes'] &
		SocketEntryOf<
			JoinPath<App['prefix'], Path>,
			Options & ThreadSchema<Results>
		>,
	App['prefix'],
	App['shortcuts']
>;

/**
 * `app.ws(path, options?, ...middlewares, handlers)`: a WebSocket route
 * whose upgrade request runs the hooks before it, then its middlewares —
 * a `validate` among them checks it — and opens; what they added,
 * `socket.data` reads. A middleware that awaits `next()` receives a
 * stand-in response once the socket is open: return it as it is.
 *
 * ```ts
 * app.ws('/rooms/:room', { message: Chat, send: Chat }, auth, {
 *   open: (socket) => socket.subscribe(socket.data.params.room),
 *   message: (socket, chat) => socket.publish(socket.data.params.room, chat),
 * });
 * ```
 */
export interface SocketForms<App extends AppTypes> {
	<const Path extends RoutePath>(
		path: PathAt<App['prefix'], Path>,
		handlers: SocketHandlersAfter<App, Path, [], Empty>,
	): AppWithSocket<App, Path, Empty, []>;
	<const Path extends RoutePath, R1 extends MiddlewareReturn>(
		path: PathAt<App['prefix'], Path>,
		m1: RouteStep<App, Path, [], R1>,
		handlers: SocketHandlersAfter<App, Path, [R1], Empty>,
	): AppWithSocket<App, Path, Empty, [R1]>;
	<
		const Path extends RoutePath,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
	>(
		path: PathAt<App['prefix'], Path>,
		m1: RouteStep<App, Path, [], R1>,
		m2: RouteStep<App, Path, [R1], R2>,
		handlers: SocketHandlersAfter<App, Path, [R1, R2], Empty>,
	): AppWithSocket<App, Path, Empty, [R1, R2]>;
	<
		const Path extends RoutePath,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
	>(
		path: PathAt<App['prefix'], Path>,
		m1: RouteStep<App, Path, [], R1>,
		m2: RouteStep<App, Path, [R1], R2>,
		m3: RouteStep<App, Path, [R1, R2], R3>,
		handlers: SocketHandlersAfter<App, Path, [R1, R2, R3], Empty>,
	): AppWithSocket<App, Path, Empty, [R1, R2, R3]>;
	<
		const Path extends RoutePath,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
		R4 extends MiddlewareReturn,
	>(
		path: PathAt<App['prefix'], Path>,
		m1: RouteStep<App, Path, [], R1>,
		m2: RouteStep<App, Path, [R1], R2>,
		m3: RouteStep<App, Path, [R1, R2], R3>,
		m4: RouteStep<App, Path, [R1, R2, R3], R4>,
		handlers: SocketHandlersAfter<App, Path, [R1, R2, R3, R4], Empty>,
	): AppWithSocket<App, Path, Empty, [R1, R2, R3, R4]>;
	<
		const Path extends RoutePath,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
		R4 extends MiddlewareReturn,
		R5 extends MiddlewareReturn,
	>(
		path: PathAt<App['prefix'], Path>,
		m1: RouteStep<App, Path, [], R1>,
		m2: RouteStep<App, Path, [R1], R2>,
		m3: RouteStep<App, Path, [R1, R2], R3>,
		m4: RouteStep<App, Path, [R1, R2, R3], R4>,
		m5: RouteStep<App, Path, [R1, R2, R3, R4], R5>,
		handlers: SocketHandlersAfter<App, Path, [R1, R2, R3, R4, R5], Empty>,
	): AppWithSocket<App, Path, Empty, [R1, R2, R3, R4, R5]>;
	<
		const Path extends RoutePath,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
		R4 extends MiddlewareReturn,
		R5 extends MiddlewareReturn,
		R6 extends MiddlewareReturn,
	>(
		path: PathAt<App['prefix'], Path>,
		m1: RouteStep<App, Path, [], R1>,
		m2: RouteStep<App, Path, [R1], R2>,
		m3: RouteStep<App, Path, [R1, R2], R3>,
		m4: RouteStep<App, Path, [R1, R2, R3], R4>,
		m5: RouteStep<App, Path, [R1, R2, R3, R4], R5>,
		m6: RouteStep<App, Path, [R1, R2, R3, R4, R5], R6>,
		handlers: SocketHandlersAfter<App, Path, [R1, R2, R3, R4, R5, R6], Empty>,
	): AppWithSocket<App, Path, Empty, [R1, R2, R3, R4, R5, R6]>;
	<
		const Path extends RoutePath,
		R1 extends MiddlewareReturn,
		R2 extends MiddlewareReturn,
		R3 extends MiddlewareReturn,
		R4 extends MiddlewareReturn,
		R5 extends MiddlewareReturn,
		R6 extends MiddlewareReturn,
		R7 extends MiddlewareReturn,
	>(
		path: PathAt<App['prefix'], Path>,
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
			Empty
		>,
	): AppWithSocket<App, Path, Empty, [R1, R2, R3, R4, R5, R6, R7]>;
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
		handlers: SocketHandlersAfter<
			App,
			Path,
			[R1, R2, R3, R4, R5, R6, R7, R8],
			Empty
		>,
	): AppWithSocket<App, Path, Empty, [R1, R2, R3, R4, R5, R6, R7, R8]>;
}
