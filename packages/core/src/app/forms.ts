/**
 * The middleware forms, by name, and what each fills in: its head, its
 * middleware, its tail and what it returns, which `Bare` and `Ladder`
 * (`ladder.ts`) lay its overloads out from.
 */
import type { AppTypes } from './route-forms';

/**
 * Every middleware form, by name, given what a call inferred: `A` and `B`
 * from its head — a path, an operation, options — `Results` what the
 * middlewares before returned, `Result` what the one being typed returns,
 * `Handled` what the handler returns. Each form's file adds its own, with
 * `declare module './forms'`; a `FormSlots` each.
 */
export interface Forms<
	App extends AppTypes,
	A,
	B,
	Results extends readonly unknown[],
	Result,
	Handled,
> {
	/** Not a form: it reads every parameter, which the forms read some of. */
	readonly '~given': FormSlots & {
		readonly given: [App, A, B, Results, Result, Handled];
	};
}

/** What a form fills in. */
export interface FormSlots {
	/** What `A`, `B`, and the handler's result, extend. */
	readonly aBound: unknown;
	readonly bBound: unknown;
	readonly handledBound: unknown;
	/** The arguments before the middlewares, a middleware, and those after. */
	readonly head: readonly unknown[];
	readonly step: unknown;
	readonly tail: readonly unknown[];
	/** What the call returns. */
	readonly out: unknown;
}

/** The name of a form. */
export type FormName = keyof Forms<
	AppTypes,
	unknown,
	unknown,
	[],
	unknown,
	unknown
>;

/** Form `K` of `App`, given what a call inferred. */
export type Of<
	K extends FormName,
	App extends AppTypes,
	A,
	B,
	Results extends readonly unknown[],
	Result = unknown,
	Handled = unknown,
> = Forms<App, A, B, Results, Result, Handled>[K];

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

/** The middleware after the ones that returned `Before`, returning `Result`. */
export type Step<
	K extends FormName,
	App extends AppTypes,
	A,
	B,
	Before extends readonly unknown[],
	Result,
> = Of<K, App, A, B, Before, Result>['step'];

/** The arguments after the middlewares that returned `Results`. */
export type Tail<
	K extends FormName,
	App extends AppTypes,
	A,
	B,
	Results extends readonly unknown[],
	Handled,
> = Of<K, App, A, B, Results, unknown, Handled>['tail'];
