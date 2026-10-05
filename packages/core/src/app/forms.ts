/**
 * The middleware forms, by name, and what each fills in: its head, the
 * context its middlewares read, its tail and what it returns, which `Bare`
 * and `Ladder` (`ladder.ts`) lay its overloads out from.
 */
import type { AppTypes } from './route-forms';
import type { FunctionLike } from './types';

/**
 * Every middleware form, by name, given what a call inferred: `A` and `B`
 * from its head — a path, an operation, options — `Results` what the
 * middlewares before returned, `Handled` what the handler returns. Each form's file adds its own, with
 * `declare module './forms'`; a `FormSlots` each.
 */
export interface Forms<
	App extends AppTypes,
	A,
	B,
	Results extends readonly unknown[],
	Handled,
> {
	/** Not a form: it reads every parameter, which the forms read some of. */
	readonly '~given': FormSlots & {
		readonly given: [App, A, B, Results, Handled];
	};
}

/** What a form fills in. */
export interface FormSlots {
	/** What `A`, `B`, and the handler's result, extend. */
	readonly aBound: unknown;
	readonly bBound: unknown;
	readonly handledBound: unknown;
	/** The arguments before the middlewares, and those after. */
	readonly head: readonly unknown[];
	readonly tail: readonly unknown[];
	/** The context the middleware after those that returned `Results` reads. */
	readonly reads: unknown;
	/**
	 * What the argument after the head is never in this form, when another
	 * form of the same method takes it: `'object'` for a form whose first
	 * middleware may stand where the options of another stand, `'function'`
	 * for the options form. The call is then refused by its length
	 * (`Guarded`), so that TypeScript reports the other form alone.
	 */
	readonly excludes: unknown;
	/** What the call returns. */
	readonly out: unknown;
}

/** The name of a form. */
export type FormName = keyof Forms<AppTypes, unknown, unknown, [], unknown>;

/** Form `K` of `App`, given what a call inferred. */
export type Of<
	K extends FormName,
	App extends AppTypes,
	A,
	B,
	Results extends readonly unknown[],
	Handled = unknown,
> = Forms<App, A, B, Results, Handled>[K];

/** What `A` extends. */
export type ABound<K extends FormName, App extends AppTypes> = Of<
	K,
	App,
	unknown,
	unknown,
	[]
>['aBound'];
/** What `B` extends. */
export type BBound<K extends FormName, App extends AppTypes> = Of<
	K,
	App,
	unknown,
	unknown,
	[]
>['bBound'];
/** What the handler after the middlewares that returned `Results` may return. */
export type Bound<
	K extends FormName,
	App extends AppTypes,
	A,
	B,
	Results extends readonly unknown[],
> = Of<K, App, A, B, Results>['handledBound'];
/** What the call returns. */
export type Out<
	K extends FormName,
	App extends AppTypes,
	A,
	B,
	Results extends readonly unknown[],
> = Of<K, App, A, B, Results>['out'];

/** The arguments before the middlewares. */
export type Head<K extends FormName, App extends AppTypes, A, B> = Of<
	K,
	App,
	A,
	B,
	[]
>['head'];

/** The context the middleware after the ones that returned `Before` reads. */
export type Reads<
	K extends FormName,
	App extends AppTypes,
	A,
	B,
	Before extends readonly unknown[],
> = Of<K, App, A, B, Before>['reads'];

/** The arguments after the middlewares that returned `Results`. */
export type Tail<
	K extends FormName,
	App extends AppTypes,
	A,
	B,
	Results extends readonly unknown[],
	Handled,
> = Of<K, App, A, B, Results, Handled>['tail'];

/** The form `excludes` of form `K`. */
export type Excludes<K extends FormName, App extends AppTypes> = Of<
	K,
	App,
	unknown,
	unknown,
	[]
>['excludes'];

/** Nine arguments more than any form takes: a call this long matches no overload. */
type TooLong = [never, never, never, never, never, never, never, never, never];

/**
 * `T`, made too long to match when the argument after the head is what
 * form `K` excludes (`FormSlots['excludes']`): `First`, the first
 * middleware, an object where it stands for another form's options; `B`,
 * the options, a function where it stands for another form's middleware.
 * Refused by its length, the overload is no candidate TypeScript reports.
 */
type Guarded<
	K extends FormName,
	App extends AppTypes,
	First,
	B,
	T extends readonly unknown[],
> =
	Excludes<K, App> extends 'object'
		? [First] extends [FunctionLike]
			? T
			: [...T, ...TooLong]
		: Excludes<K, App> extends 'function'
			? [B] extends [FunctionLike]
				? [...T, ...TooLong]
				: T
			: T;

/** `Tail` of form `K`, refused by its length when `First` or `B` is what the form excludes. */
export type Rest<
	K extends FormName,
	App extends AppTypes,
	A,
	B,
	Results extends readonly unknown[],
	Handled,
	First,
> = Guarded<K, App, First, B, Tail<K, App, A, B, Results, Handled>>;
