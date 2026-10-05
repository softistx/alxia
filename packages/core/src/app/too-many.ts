/**
 * A call with more middlewares than a form types, refused with a message
 * that names the limit and what to do instead: `compose(...)`.
 */
import type {
	ABound,
	BBound,
	Excludes,
	FormName,
	Head,
	Out,
	TooLong,
} from './forms';
import type { AppTypes } from './route-forms';
import type { FunctionLike } from './types';

/** What TypeScript reports on the ninth middleware of a call. */
export type TooManyMiddlewares =
	'at most 8 middlewares per route: group them with compose(...)';

type F = FunctionLike;

/**
 * The middlewares of a call too long for the ladder, the ninth refused
 * with the message; `TooLong`, refused by its length, when the argument after the head is what
 * form `K` excludes, as `Guarded` (`forms.ts`) does for the ladder's.
 */
type Nine<K extends FormName, App extends AppTypes, First, B> = [
	Excludes<K, App>,
] extends ['object']
	? [First] extends [F]
		? Over<First>
		: TooLong
	: [Excludes<K, App>] extends ['function']
		? [B] extends [F]
			? TooLong
			: Over<First>
		: Over<First>;

type Over<First> = [
	m1: First,
	m2: F,
	m3: F,
	m4: F,
	m5: F,
	m6: F,
	m7: F,
	m8: F,
	m9: TooManyMiddlewares,
	...rest: unknown[],
];

/** Form `K` given 9 middlewares or more: the ninth is refused with `TooManyMiddlewares`. */
export type TooMany<K extends FormName, App extends AppTypes> = <
	const A extends ABound<K, App>,
	const B extends BBound<K, App>,
	F1 = F,
>(
	...args: [...Head<K, App, A, B>, ...Nine<K, App, F1, B>]
) => Out<K, App, A, B, []>;
