/**
 * The type of `ws`: a socket route, with or without a list of hooks after
 * its path.
 */
import type { AnyReply } from '../reply/reply';
import type { JoinPath, PathAt, RoutePath } from '../types/path';
import type {
	SocketContext,
	SocketHandlers,
	SocketMessage,
	SocketSchema,
	SocketSend,
} from '../ws/types';
import type { Alxia } from './alxia';
import type { NotAFunction } from './route-forms';
import type { RouteApp } from './route-method';
import type { SocketForms } from './socket-forms';
import type { SocketOptionsForms } from './socket-options';
import type { AnyRouteHook, Empty, RouteHookBase, ThreadHooks } from './types';

/**
 * `app.ws(path, options?, ...middlewares, handlers)`, see `SocketForms`;
 * and the forms of 0.3, deprecated: `app.ws(path, schema, handlers)`, or
 * `app.ws(path, hooks, schema, handlers)`.
 */
export interface SocketMethod<
	Ctx extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> extends SocketForms<RouteApp<'GET', Ctx, Prefix, Shortcuts>>,
		SocketOptionsForms<RouteApp<'GET', Ctx, Prefix, Shortcuts>>,
		DeprecatedSocketForms<Ctx, Prefix, Shortcuts> {}

/** The forms of `ws` 0.3 had, which the middleware forms replace. */
export interface DeprecatedSocketForms<
	Ctx extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
	/**
	 * A WebSocket route. The upgrade request runs the hooks before it and is
	 * validated as a route's; each message is then checked by `message`, and
	 * each one sent by `send`. Open through `listen`, or a `Bun.serve` given
	 * `fetch` and `websocket`: a socket needs a server.
	 *
	 * ```ts
	 * app.ws('/rooms/:room', { message: Chat, send: Chat }, {
	 *   open: (socket) => socket.subscribe(socket.data.params.room),
	 *   message: (socket, chat) => socket.publish(socket.data.params.room, chat),
	 * });
	 * ```
	 *
	 * @deprecated A schema before the handlers: give `message` and `send` as
	 * options, and the request's schemas to a `validate(…)` middleware —
	 * see the upgrading guide.
	 */
	<const Path extends RoutePath, Schema extends SocketSchema = Empty>(
		path: PathAt<Prefix, Path>,
		schema: Schema & NotAFunction,
		handlers: SocketHandlers<
			SocketContext<Ctx, JoinPath<Prefix, Path>, Schema>,
			SocketSend<Schema>,
			SocketMessage<Schema>
		>,
	): Alxia<Ctx, Prefix, Shortcuts>;
	/**
	 * A WebSocket route with hooks of its own, run on the upgrade request
	 * after the hooks before it: what they add, `socket.data` reads. A
	 * `defineWrap` in the list is skipped, as a socket's upgrade skips
	 * every `wrap`.
	 *
	 * @deprecated A list of hooks after the path: give them as middlewares,
	 * made by `defineMiddleware` — see the upgrading guide.
	 */
	<
		const Path extends RoutePath,
		const Hooks extends readonly [] | readonly AnyRouteHook[],
		Schema extends SocketSchema = Empty,
	>(
		path: PathAt<Prefix, Path>,
		hooks: Hooks &
			NoInfer<
				ThreadHooks<RouteHookBase<Ctx, JoinPath<Prefix, Path>>, Hooks>['checks']
			>,
		schema: Schema & NotAFunction,
		handlers: SocketHandlers<
			SocketContext<
				Ctx &
					ThreadHooks<
						RouteHookBase<Ctx, JoinPath<Prefix, Path>>,
						Hooks
					>['added'],
				JoinPath<Prefix, Path>,
				Schema
			>,
			SocketSend<Schema>,
			SocketMessage<Schema>
		>,
	): Alxia<Ctx, Prefix, Shortcuts>;
}
