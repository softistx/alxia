/**
 * The type of a route method — `get`, `post`, … — in its four forms: with
 * or without a schema, and with or without a list of hooks after the path.
 */
import type { AnyReply } from '../reply/reply';
import type { JoinPath, PathAt, RoutePath } from '../types/path';
import type { Alxia } from './alxia';
import type {
	AnyRouteHook,
	Context,
	Empty,
	HandlerResult,
	MaybePromise,
	Method,
	RouteEntryOf,
	RouteHookBase,
	RouteSchema,
	ThreadHooks,
	ValidSchema,
} from './types';

/**
 * A route method: `app.get(path, schema, handler)` or `app.get(path,
 * handler)`, each with a list of hooks after the path, if any:
 * `app.get(path, [canView], schema, handler)`.
 */
export interface RouteMethod<
	M extends Method,
	Ctx extends object,
	Routes extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
	<
		const Path extends RoutePath,
		Schema extends RouteSchema,
		Result extends HandlerResult<Schema>,
	>(
		path: PathAt<Prefix, Path>,
		schema: Schema & ValidSchema<JoinPath<Prefix, Path>, Schema>,
		handler: (
			ctx: Context<Ctx, JoinPath<Prefix, Path>, Schema>,
		) => MaybePromise<Result>,
	): Alxia<
		Ctx,
		Routes & RouteEntryOf<M, JoinPath<Prefix, Path>, Schema, Result, Shortcuts>,
		Prefix,
		Shortcuts
	>;
	<const Path extends RoutePath, Result extends AnyReply>(
		path: PathAt<Prefix, Path>,
		handler: (
			ctx: Context<Ctx, JoinPath<Prefix, Path>, Empty>,
		) => MaybePromise<Result>,
	): Alxia<
		Ctx,
		Routes & RouteEntryOf<M, JoinPath<Prefix, Path>, Empty, Result, Shortcuts>,
		Prefix,
		Shortcuts
	>;
	<
		const Path extends RoutePath,
		const Hooks extends readonly [] | readonly AnyRouteHook[],
		Schema extends RouteSchema,
		Result extends HandlerResult<Schema>,
	>(
		path: PathAt<Prefix, Path>,
		hooks: Hooks &
			NoInfer<
				ThreadHooks<RouteHookBase<Ctx, JoinPath<Prefix, Path>>, Hooks>['checks']
			>,
		schema: Schema & ValidSchema<JoinPath<Prefix, Path>, Schema>,
		handler: (
			ctx: Context<
				Ctx &
					ThreadHooks<
						RouteHookBase<Ctx, JoinPath<Prefix, Path>>,
						Hooks
					>['added'],
				JoinPath<Prefix, Path>,
				Schema
			>,
		) => MaybePromise<Result>,
	): Alxia<
		Ctx,
		Routes &
			RouteEntryOf<
				M,
				JoinPath<Prefix, Path>,
				Schema,
				Result,
				| Shortcuts
				| ThreadHooks<
						RouteHookBase<Ctx, JoinPath<Prefix, Path>>,
						Hooks
				  >['replies']
			>,
		Prefix,
		Shortcuts
	>;
	<
		const Path extends RoutePath,
		const Hooks extends readonly [] | readonly AnyRouteHook[],
		Result extends AnyReply,
	>(
		path: PathAt<Prefix, Path>,
		hooks: Hooks &
			NoInfer<
				ThreadHooks<RouteHookBase<Ctx, JoinPath<Prefix, Path>>, Hooks>['checks']
			>,
		handler: (
			ctx: Context<
				Ctx &
					ThreadHooks<
						RouteHookBase<Ctx, JoinPath<Prefix, Path>>,
						Hooks
					>['added'],
				JoinPath<Prefix, Path>,
				Empty
			>,
		) => MaybePromise<Result>,
	): Alxia<
		Ctx,
		Routes &
			RouteEntryOf<
				M,
				JoinPath<Prefix, Path>,
				Empty,
				Result,
				| Shortcuts
				| ThreadHooks<
						RouteHookBase<Ctx, JoinPath<Prefix, Path>>,
						Hooks
				  >['replies']
			>,
		Prefix,
		Shortcuts
	>;
}
