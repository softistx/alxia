/**
 * The pieces every middleware form of a route method is written in: the
 * context each middleware reads, the handler after them, and the app the
 * call returns.
 */
import type { AnyReply } from '../reply/reply';
import type { JoinPath } from '../types/path';
import type { Alxia } from './alxia';
import type {
	HandlerContext,
	HandlerResult,
	MaybePromise,
	Method,
	MiddlewareBase,
	NextFunction,
	RouteDetail,
	RouteEntryOf,
	ThreadContext,
	ThreadReplies,
	ThreadSchema,
} from './types';

/**
 * A route's options: its configuration, never its schemas — those are
 * `validate(…)` and `responds(…)`, among its middlewares.
 */
export interface RouteOptions {
	/**
	 * The most bytes the request body may hold, past which it is refused
	 * with a 413. Overrides a `bodyLimit()` declared before the route.
	 */
	readonly bodyLimit?: number;
	/** What OpenAPI says of the route, and nothing at runtime. */
	readonly detail?: RouteDetail;
}

/** `Options`, with no schema in it: a schema is a `validate` or `responds` middleware. */
export type OptionsOnly<Options> = Options &
	NotAFunction & {
		readonly [Key in
			| 'params'
			| 'query'
			| 'headers'
			| 'cookies'
			| 'body'
			| 'response']?: never;
	};

/**
 * An object, never a function: what a route's options or schema are
 * written with, so that no overload taking them reads a middleware there —
 * which would type the handler after it by the wrong overload.
 */
export interface NotAFunction {
	readonly bind?: never;
}

/**
 * The types of the app a route method belongs to, and the method: what
 * the middleware forms are written in.
 */
export interface AppTypes {
	readonly method: Method;
	readonly ctx: object;
	readonly routes: object;
	readonly prefix: string;
	readonly shortcuts: AnyReply;
}

/** The context of the first middleware of a route at `Path` on `App`. */
export type RouteBase<
	App extends AppTypes,
	Path extends string,
> = MiddlewareBase<App['ctx'], JoinPath<App['prefix'], Path>>;

/**
 * A middleware of a route at `Path` on `App`, after the middlewares that
 * returned `Before`: it reads their context, and returns `Result`.
 */
export type RouteMiddleware<
	App extends AppTypes,
	Path extends string,
	Before extends readonly unknown[],
	Result,
> = (
	ctx: ThreadContext<RouteBase<App, Path>, Before>,
	next: NextFunction,
) => Result;

/** The handler of a route at `Path` on `App`, after the middlewares that returned `Results`. */
export type RouteHandler<
	App extends AppTypes,
	Path extends string,
	Results extends readonly unknown[],
	Result,
> = (
	ctx: HandlerContext<
		ThreadContext<RouteBase<App, Path>, Results>,
		ThreadSchema<Results>
	>,
) => MaybePromise<Result>;

/** What the handler after the middlewares that returned `Results` may return. */
export type RouteResult<Results extends readonly unknown[]> = HandlerResult<
	ThreadSchema<Results>
>;

/** `App` with the route at `Path` added to its table. */
export type AppWithRoute<
	App extends AppTypes,
	Path extends string,
	Options,
	Results extends readonly unknown[],
	Result,
> = Alxia<
	App['ctx'],
	App['routes'] &
		RouteEntryOf<
			App['method'],
			JoinPath<App['prefix'], Path>,
			Options & ThreadSchema<Results>,
			Result,
			App['shortcuts'] | ThreadReplies<Results>
		>,
	App['prefix'],
	App['shortcuts']
>;
