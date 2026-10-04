/**
 * The type of a route method — `get`, `post`, … — in its four forms: with
 * or without a schema, and with or without a list of hooks after the path;
 * and how a call's arguments are read.
 */
import type { AnyReply } from '../reply/reply';
import type { JoinPath, PathAt, RoutePath } from '../types/path';
import type { Alxia } from './alxia';
import type { AppTypes, NotAFunction } from './route-forms';
import type { MiddlewareForms } from './route-middlewares';
import type { OptionsForms } from './route-options';
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
 * A route method: `app.get(path, options?, ...middlewares, handler)`, see
 * `MiddlewareForms` and `OptionsForms`; `app.get(path, handler)`; and the
 * forms of 0.3, deprecated: a schema before the handler, a list of hooks
 * after the path.
 */
export interface RouteMethod<
	M extends Method,
	Ctx extends object,
	Routes extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> extends MiddlewareForms<RouteApp<M, Ctx, Routes, Prefix, Shortcuts>>,
		OptionsForms<RouteApp<M, Ctx, Routes, Prefix, Shortcuts>>,
		DeprecatedForms<M, Ctx, Routes, Prefix, Shortcuts> {}

/** The forms of a route method that 0.3 had, which the middleware forms replace. */
export interface DeprecatedForms<
	M extends Method,
	Ctx extends object,
	Routes extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
	/**
	 * @deprecated A schema before the handler: give `validate(…)` and
	 * `responds(…)` as middlewares instead, `options` for its `bodyLimit`
	 * and `detail` — see the upgrading guide.
	 */
	<
		const Path extends RoutePath,
		Schema extends RouteSchema,
		Result extends HandlerResult<Schema>,
	>(
		path: PathAt<Prefix, Path>,
		schema: Schema & NotAFunction & ValidSchema<JoinPath<Prefix, Path>, Schema>,
		handler: (
			ctx: Context<Ctx, JoinPath<Prefix, Path>, Schema>,
		) => MaybePromise<Result>,
	): Alxia<
		Ctx,
		Routes & RouteEntryOf<M, JoinPath<Prefix, Path>, Schema, Result, Shortcuts>,
		Prefix,
		Shortcuts
	>;
	/**
	 * @deprecated A list of hooks after the path: give them as middlewares,
	 * made by `defineMiddleware` — see the upgrading guide.
	 */
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
		schema: Schema & NotAFunction & ValidSchema<JoinPath<Prefix, Path>, Schema>,
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
	/**
	 * @deprecated A list of hooks after the path: give them as middlewares,
	 * made by `defineMiddleware` — see the upgrading guide.
	 */
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

/** The types of an app and a method, as the middleware forms read them. */
export interface RouteApp<
	M extends Method,
	Ctx extends object,
	Routes extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> extends AppTypes {
	readonly method: M;
	readonly ctx: Ctx;
	readonly routes: Routes;
	readonly prefix: Prefix;
	readonly shortcuts: Shortcuts;
}
