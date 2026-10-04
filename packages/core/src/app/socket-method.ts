/**
 * The type of `ws`: a socket route, with or without a list of hooks after
 * its path.
 */
import type { AnyReply } from '../reply/reply';
import type { JoinPath, PathAt, RoutePath } from '../types/path';
import type {
	SocketContext,
	SocketEntryOf,
	SocketHandlers,
	SocketMessage,
	SocketSchema,
	SocketSend,
} from '../ws/types';
import type { Alxia } from './alxia';
import type { AnyRouteHook, Empty, RouteHookBase, ThreadHooks } from './types';

/** `app.ws(path, schema, handlers)`, or `app.ws(path, hooks, schema, handlers)`. */
export interface SocketMethod<
	Ctx extends object,
	Routes extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
	<const Path extends RoutePath, Schema extends SocketSchema = Empty>(
		path: PathAt<Prefix, Path>,
		schema: Schema,
		handlers: SocketHandlers<
			SocketContext<Ctx, JoinPath<Prefix, Path>, Schema>,
			SocketSend<Schema>,
			SocketMessage<Schema>
		>,
	): Alxia<
		Ctx,
		Routes & SocketEntryOf<JoinPath<Prefix, Path>, Schema>,
		Prefix,
		Shortcuts
	>;
	/**
	 * A WebSocket route with hooks of its own, run on the upgrade request
	 * after the hooks before it: what they add, `socket.data` reads. A
	 * `defineWrap` in the list is skipped, as a socket's upgrade skips
	 * every `wrap`.
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
		schema: Schema,
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
	): Alxia<
		Ctx,
		Routes & SocketEntryOf<JoinPath<Prefix, Path>, Schema>,
		Prefix,
		Shortcuts
	>;
}
