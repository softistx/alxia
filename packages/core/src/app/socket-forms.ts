/**
 * The middleware forms of `ws`: `app.ws(path, options?, ...middlewares,
 * handlers)`, up to 8 middlewares run on the upgrade request.
 */
import type { StandardSchemaV1 } from '../schema/standard-schema';
import type { PathAt, RoutePath } from '../types/path';
import type { SocketHandlers, SocketMessage, SocketSend } from '../ws/types';
import type { FormSlots } from './forms';
import type { Bare, Ladder } from './ladder';
import type {
	AppTypes,
	AppWithRoute,
	NotAFunction,
	RouteBase,
	RouteReads,
} from './route-forms';
import type { Empty, RouteDetail, ThreadContext, ThreadSchema } from './types';

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
		readonly [Key in
			| 'params'
			| 'query'
			| 'headers'
			| 'cookies'
			| 'body'
			| 'response']?: never;
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
> =
	ThreadSchema<Results> extends { readonly response: unknown }
		? 'responds() checks replies, and a socket route sends none: check its messages with the `send` option'
		: SocketHandlers<
				SocketDataAfter<App, Path, Results>,
				SocketSend<Options>,
				SocketMessage<Options>
			>;

/**
 * `app.ws(path, options?, ...middlewares, handlers)`: a WebSocket route
 * whose upgrade request runs the hooks before it, then its middlewares —
 * a `validate` among them checks it — and opens; what they added,
 * `socket.data` reads. A middleware that awaits `next()` receives a
 * stand-in response once the socket is open: return it as it is (headers
 * set on it are lost; set them on `ctx.set.headers` before).
 *
 * ```ts
 * app.ws('/rooms/:room', { message: Chat, send: Chat }, auth, {
 *   open: (socket) => socket.subscribe(socket.data.params.room),
 *   message: (socket, chat) => socket.publish(socket.data.params.room, chat),
 * });
 * ```
 */
export interface SocketForms<App extends AppTypes>
	extends Bare<'socket', App>,
		Ladder<'socket', App> {}

declare module './forms' {
	interface Forms<
		App extends AppTypes,
		A,
		B,
		Results extends readonly unknown[],
		Handled,
	> {
		readonly socket: SocketForm<App, A, Results>;
	}
}

/** `app.ws(path, ...middlewares, handlers)`. */
export interface SocketForm<
	App extends AppTypes,
	A,
	Results extends readonly unknown[],
> extends FormSlots {
	readonly aBound: RoutePath;
	readonly excludes: 'object';
	readonly head: [path: PathAt<App['prefix'], A & string>];
	readonly reads: RouteReads<App, A & string, Results>;
	readonly tail: [
		handlers: SocketHandlersAfter<App, A & string, Results, Empty>,
	];
	readonly out: AppWithRoute<App>;
}
