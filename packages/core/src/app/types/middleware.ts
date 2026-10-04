/**
 * The middleware model: one function, `(ctx, next) => …`, for what used to
 * be a `derive`, a `wrap` and a route's validation. What it passes `next`
 * is added to the context of what follows; what it returns says so in its
 * type, which a route threads from one middleware to the next.
 */
import type { AnyReply } from '../../reply/reply';
import type { PathParams } from '../../types/path';
import type { Empty, MaybePromise } from './common';
import type { BaseContext } from './context';
import type { RawRequestParts } from './route-hooks';
import type { ResponsesOf } from './schema';
import type { TypedReplyFunction } from './typed-reply';

/**
 * What `next(added)` resolves to: the response of the rest of the route —
 * the middlewares after this one and the handler — branded with `Added`,
 * what this middleware passed on, and `Schema`, what `validate` and
 * `responds` declare. The brand is never set: at runtime it is the
 * `Response` itself, so a middleware may read it, set a header on it, and
 * return it.
 */
export type Next<
	Added extends object = Empty,
	Schema extends object = Empty,
> = Response & {
	/** Never set: what the middleware added, and the schemas it declares. */
	readonly '~next': { readonly added: Added; readonly schema: Schema };
};

/**
 * `next` as a middleware receives it: runs the rest of the route, with
 * `added` merged into the context it reads, and resolves to its response.
 * Called once at most.
 */
export interface NextFunction {
	(): Promise<Next>;
	<Added extends object>(added: Added): Promise<Next<Added>>;
}

/** What a middleware may return: `next(…)`'s response, a reply, or a `Response` of its own. */
export type MiddlewareResult = Next | AnyReply | Response;

/** What a middleware's function returns: its result, or a promise of it. */
export type MiddlewareReturn = MaybePromise<MiddlewareResult>;

/** What a middleware made by `defineMiddleware<Requires>()` reads: the base context and `Requires`. */
export type MiddlewareContext<Requires = Empty> = BaseContext & Requires;

/**
 * A middleware: it reads the context, then returns a reply that ends the
 * request, a `Response`, or what `next(added)` resolves to.
 */
export type Middleware<Requires = Empty, Result = MiddlewareReturn> = (
	ctx: MiddlewareContext<Requires>,
	next: NextFunction,
) => Result;

/**
 * What `defineMiddleware` marks its middleware with, which `app.use` reads
 * to tell it from a plugin written as a function. Never set as such: at
 * runtime the mark is a symbol on the function.
 */
export interface MiddlewareMark {
	readonly '~middleware': true;
}

/**
 * What `validate` and `responds` mark their middleware with: a step the
 * chain runs itself, which `use` refuses. Never set as such: at runtime
 * the mark is `Symbol.for('alxia.builtin')` on the function, shared by
 * every copy of `@alxia/core`, as `defineMiddleware`'s is.
 */
export interface BuiltinMark<Kind extends 'validate' | 'responds'> {
	readonly '~builtin': Kind;
}

/**
 * What a route's first middleware reads: the base context, what the hooks
 * before the route added, and the request as it arrived — the path
 * parameters and query as strings, the headers, and no body until a
 * `validate` reads it.
 */
export type MiddlewareBase<Ctx, Path extends string> = BaseContext &
	Ctx & {
		readonly params: PathParams<Path>;
		readonly pathParams: PathParams<Path>;
		readonly query: RawRequestParts['query'];
		readonly headers: Readonly<Record<string, string>>;
		readonly body: undefined;
	};

/** `Base` with `Added` on top: a key both hold is `Added`'s. */
export type Merge<Base, Added> = [keyof Added & keyof Base] extends [never]
	? Base & Added
	: Omit<Base, keyof Added> & Added;

/** What a middleware's result adds to the context: what it passed `next`. */
export type AddedOf<Result> = [ResultAdded<Result>] extends [never]
	? Empty
	: ResultAdded<Result>;
type ResultAdded<Result> =
	Awaited<Result> extends infer Settled
		? Settled extends Next<infer Added, any>
			? Added
			: never
		: never;

/** The schemas a middleware's result declares: `validate`'s and `responds`'. */
export type SchemaOf<Result> = [ResultSchema<Result>] extends [never]
	? Empty
	: ResultSchema<Result>;
type ResultSchema<Result> =
	Awaited<Result> extends infer Settled
		? Settled extends Next<any, infer Schema>
			? Schema
			: never
		: never;

/** The context after the middlewares whose results are `Results`, in order. */
export type ThreadContext<
	Ctx,
	Results extends readonly unknown[],
> = Results extends readonly [infer Result, ...infer Rest]
	? ThreadContext<Merge<Ctx, AddedOf<Result>>, Rest>
	: Ctx;

/** The schemas the middlewares whose results are `Results` declare together. */
export type ThreadSchema<Results extends readonly unknown[]> =
	Results extends readonly [infer Result, ...infer Rest]
		? SchemaOf<Result> & ThreadSchema<Rest>
		: Empty;

/**
 * What a route's handler reads after its middlewares: their context, and
 * `reply` typed by the statuses a `responds` before it declares.
 */
export type HandlerContext<Ctx, Schema> = [ResponsesOf<Schema>] extends [never]
	? Ctx
	: Omit<Ctx, 'reply'> & {
			readonly reply: TypedReplyFunction<ResponsesOf<Schema>>;
		};
