/**
 * The type of `compose(...middlewares)`: one middleware standing for
 * several, typed for any number of them. It reads what its members read
 * of the context it is given, less what the ones before them add, and
 * passes `next` everything they add, so a route checks it as it checks
 * one middleware.
 */
import type { Simplify } from '../../types/json';
import type { Empty } from './common';
import type { BaseContext } from './context';
import type {
	MiddlewareReturn,
	Next,
	NextFunction,
	ThreadContext,
	ThreadSchema,
} from './middleware';

/**
 * A middleware `compose` takes: any `(ctx, next)` function. Its `ctx` is
 * read bivariantly, so that one written by `defineMiddleware<Requires>()`
 * is taken, while an inline one reads the base context.
 */
export type Composable = {
	bivariance(ctx: BaseContext, next: NextFunction): MiddlewareReturn;
}['bivariance'];

type ReadsOf<M> = M extends (ctx: infer Ctx, ...rest: never[]) => unknown
	? Ctx
	: BaseContext;
type ResultOf<M> = M extends (...args: never[]) => infer Result
	? Result
	: never;
type ResultsOf<Ms extends readonly unknown[]> = {
	readonly [Index in keyof Ms]: ResultOf<Ms[Index]>;
};

/** The keys of `Reads` that `Have` gives, with a type `Reads` takes. */
type Given<Have, Reads> = {
	[Key in keyof Reads & keyof Have]: Have[Key] extends Reads[Key] ? Key : never;
}[keyof Reads & keyof Have];

/**
 * What the members read of the context compose is given: each one's
 * `ctx`, less the base context and what the members before it add with
 * the type it reads.
 */
export type ComposedReads<
	Ms extends readonly unknown[],
	Have = Empty,
> = Ms extends readonly [infer M, ...infer Rest]
	? Omit<ReadsOf<M>, keyof BaseContext | Given<Have, ReadsOf<M>>> &
			ComposedReads<Rest, ThreadContext<Have, [ResultOf<M>]>>
	: unknown;

/** What a member's result is besides `next()`'s: a reply or a `Response` of its own. */
type OwnResults<Ms extends readonly unknown[]> = Exclude<
	Awaited<ResultOf<Ms[number]>>,
	Next<any, any>
>;

/** Carried by compose when a member is a `validate` or a `responds`: `use` refuses it, as it refuses them. */
type MarkOf<Ms extends readonly unknown[]> = [
	Extract<Ms[number], { readonly '~builtin': unknown }>,
] extends [never]
	? unknown
	: Pick<Extract<Ms[number], { readonly '~builtin': unknown }>, '~builtin'>;

/** The middleware `compose(...Ms)` makes. */
export type Composed<Ms extends readonly unknown[]> = ((
	ctx: BaseContext & Simplify<ComposedReads<Ms>>,
	next: NextFunction,
) => Promise<
	| Next<ThreadContext<Empty, ResultsOf<Ms>>, ThreadSchema<ResultsOf<Ms>>>
	| OwnResults<Ms>
>) &
	MarkOf<Ms>;
