/**
 * A middleware as a form takes it: checked against the context in force
 * where it is given, with a message, not an overload's assignability,
 * when that context lacks what it reads.
 */
import type { MiddlewareReturn, NextFunction } from './middleware';

/**
 * A middleware given where `Given` is in force, reading `Reads` and
 * returning `Result`. When `Given` gives what `Reads` names, it is the
 * function itself; else its return type is joined to a message naming
 * the key, which the middleware's result is not assignable to:
 *
 * ```text
 * Type 'Promise<Next<Empty, Empty>>' is not assignable to type
 * '"`user` is missing from the context: add a middleware that gives it before this one"'.
 * ```
 *
 * `Reads` is the middleware's own `ctx` type when it is annotated — a
 * middleware of `defineMiddleware<Requires>()` — and `Given` otherwise.
 * A function that returns a function is a factory given uncalled —
 * `use(cors)` — and is told so; anything else a middleware returns that
 * is not `next()`, a reply or a `Response` is told what it may return.
 * `Refused` is what the form refuses, joined to the function: `use`'s
 * refuses a `validate` or a `responds` (`FormSlots['refuses']`).
 */
export type Step<Given, Reads, Result, Refused = unknown> = Refused &
	((
		ctx: Reads,
		next: NextFunction,
	) => Result &
		([Result] extends [MiddlewareReturn]
			? Missing<Given, Reads>
			: Result extends FunctionLike
				? 'this looks like a factory given uncalled: call it, as use(cors()) and not use(cors)'
				: 'a middleware returns next(), a reply or a Response'));

/**
 * `unknown` when `Given` gives what `Reads` names; else why not, one
 * message per key. The messages are written inline, not behind an alias,
 * so that an error prints them.
 */
export type Missing<Given, Reads> = Given extends Reads
	? unknown
	: {
				[Key in keyof Reads]-?: Key extends keyof Given
					? Given[Key] extends Reads[Key]
						? never
						: Key extends 'pathParams'
							? [
									Exclude<NamedKeys<Reads[Key]>, NamedKeys<Given[Key]>>,
								] extends [never]
								? 'the path parameters are read with another type than the strings they arrive as'
								: `the path parameter \`${Exclude<NamedKeys<Reads[Key]>, NamedKeys<Given[Key]>> & string}\` is not in this route's path`
							: `\`${Key & string}\` is in the context with another type than this middleware reads`
					: `\`${Key & string}\` is missing from the context: add a middleware that gives it before this one`;
			}[keyof Reads] extends infer Message
		? [Message] extends [never]
			? 'the context in force here does not give what this middleware reads'
			: Message
		: never;

/** The keys `T` names, without those of an index signature. */
type NamedKeys<T> = keyof {
	[Key in keyof T as string extends Key ? never : Key]: T[Key];
};

/**
 * What any function is assignable to and no options object is: a form
 * tells a middleware from options by it, without a call signature that
 * would type an inline middleware's parameters.
 */
export interface FunctionLike {
	readonly apply: unknown;
}
