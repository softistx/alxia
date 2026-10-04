/**
 * The hooks given to one route, in a list: `app.get(path, [canView], …)`.
 * Each is made by `defineHook` or `defineWrap`, names what it reads, and
 * carries what it adds and replies; the route threads them in order.
 */
import type { AnyReply } from '../../reply/reply';
import type { PathParams } from '../../types/path';
import type { Empty } from './common';
import type { BaseContext } from './context';

declare const noHookYet: unique symbol;

/**
 * Never a value: what `defineHook<Requires>()`, given no hook, infers as the
 * hook's result, and so answers the function that takes the hook.
 */
export type NoHookYet = typeof noHookYet;

/** The most hooks one route takes in its list: what the types thread. */
export type MaxRouteHooks = 8;

/**
 * What a route's hook reads, beyond what it names: the base context, and
 * the request's path parameters and query as they arrived — a route's
 * hooks run before its schemas, so never their output, and never `body`.
 */
export interface RawRequestParts {
	/** The path parameters as they arrived: strings, whatever the `params` schema makes of them. */
	readonly params: Readonly<Record<string, string>>;
	/** The query as it arrived, before the `query` schema. */
	readonly query: Readonly<Record<string, string | readonly string[]>>;
}

/** What a hook made by `defineHook<Requires>()` reads: `Requires` on top of the base context and the raw request. */
export type HookContext<Requires = Empty> = BaseContext &
	RawRequestParts &
	Requires;

/**
 * A hook given to a route in its list, made by `defineHook`: run after the
 * hooks in force where the route is declared and those before it in the
 * list, before validation. What it returns is added to the context of the
 * hooks after it and of the handler; a reply ends the request, and joins
 * the route's type.
 */
export interface RouteHook<Requires = Empty, Result = unknown> {
	readonly kind: 'derive';
	readonly run: (ctx: never) => unknown;
	/** Never set: what the hook reads beyond `HookContext`, checked where it is given. */
	readonly '~requires': Requires;
	/** Never set: what the hook returns, awaited. */
	readonly '~result': Result;
}

/**
 * A hook around the rest of a route, given in its list, made by
 * `defineWrap`: `next()` runs the hooks after it in the list, validation
 * and the handler. A reply it returns joins the route's type. A socket's
 * upgrade skips it.
 */
export interface RouteWrap<Requires = Empty, Result = unknown> {
	readonly kind: 'wrap';
	readonly run: (ctx: never, next: () => Promise<Response>) => unknown;
	/** Never set: what the hook reads beyond `HookContext`, checked where it is given. */
	readonly '~requires': Requires;
	/** Never set: what the hook returns, awaited. */
	readonly '~result': Result;
}

/** Any hook a route's list takes. */
export type AnyRouteHook = RouteHook<any, any> | RouteWrap<any, any>;

/** What a hook adds to the context: a derive's object, nothing for a wrap. */
export type AddedBy<Hook> =
	Hook extends RouteHook<any, infer Result>
		? [Exclude<Result, AnyReply>] extends [never]
			? Empty
			: Exclude<Result, AnyReply> extends infer Added extends object
				? Added
				: Empty
		: Empty;

/** The replies a hook may end the request with. */
export type RepliesBy<Hook> = Hook extends { readonly '~result': infer Result }
	? Extract<Result, AnyReply>
	: never;

/** What the route gives a hook in its list before any hook of the list has run. */
export type RouteHookBase<Ctx, Path extends string> = BaseContext &
	Ctx & {
		readonly params: PathParams<Path>;
		readonly query: RawRequestParts['query'];
	};

/**
 * `unknown` when `Given` gives what `Requires` reads, else a `'~requires'`
 * whose type is the message, one per key. Written inline, not behind an
 * alias, so that an error prints them.
 */
export type HookProvided<Given, Requires> = Given extends {
	readonly request: Request;
} & Requires
	? unknown
	: {
				[Key in keyof Requires]-?: Key extends 'params'
					? {
							[Name in keyof Requires[Key]]-?: Name extends keyof PathParamsOf<Given>
								? never
								: `the hook reads the path parameter "${Name & string}", which this route's path does not declare`;
						}[keyof Requires[Key]]
					: Key extends keyof Given
						? Given[Key] extends Requires[Key]
							? never
							: `the hook reads "${Key & (string | number)}", which this route's context gives with another type`
						: `the hook reads "${Key & (string | number)}", which this route's context does not give: derive it before this route, or earlier in its list`;
			}[keyof Requires] extends infer Message
		? {
				readonly '~requires': [Message] extends [never]
					? "this route's context does not give what the hook reads"
					: Message;
			}
		: never;

type PathParamsOf<Given> = Given extends { readonly params: infer P }
	? P
	: Empty;

/**
 * The hooks of a route's list threaded in order from `Base`: the check of
 * each against what the ones before it added (`checks`, a tuple the list
 * is intersected with), what they add together (`added`) and the replies
 * they may end the request with (`replies`). A list longer than
 * `MaxRouteHooks` is refused as a whole.
 */
export type ThreadHooks<
	Base,
	Hooks extends readonly unknown[],
> = Hooks['length'] extends 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | MaxRouteHooks
	? Thread<Base, Hooks, Empty, never, []>
	: {
			readonly checks: {
				readonly '~hooks': `a route takes at most 8 hooks in its list: derive the rest in a group around it`;
			};
			readonly added: Empty;
			readonly replies: never;
		};

type Thread<
	Base,
	Hooks extends readonly unknown[],
	Added,
	Replies,
	Checks extends readonly unknown[],
> = Hooks extends readonly [infer Hook, ...infer Rest]
	? Thread<
			Base,
			Rest,
			Added & AddedBy<Hook>,
			Replies | RepliesBy<Hook>,
			[
				...Checks,
				Hook extends { readonly '~requires': infer Requires }
					? HookProvided<Base & Added, Requires>
					: unknown,
			]
		>
	: {
			readonly checks: Checks;
			readonly added: Added;
			readonly replies: Replies;
		};
