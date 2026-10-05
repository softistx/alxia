/**
 * The one shape every middleware form is written in: `(...head, m1, …,
 * mN, ...tail)`, `N` up to 8, each middleware reading what the ones before
 * it added. A form — a route method's, `ws`'s, `route(operation)`'s,
 * `use`'s — names its slots in `Forms` (`forms.ts`); `Bare` and `Ladder`
 * lay its overloads out from them, so that the forms cannot drift apart.
 * The middlewares are written out, `m1` to `m8`: TypeScript prints their
 * names in the overloads it reports.
 *
 * Each middleware `mI` is typed by two parameters: `RI`, what it returns,
 * and `CI`, what it reads, inferred from its `ctx` parameter when it is
 * annotated — a middleware of `defineMiddleware<Requires>()` — and the
 * context in force otherwise, so that an inline one reads that context.
 * `Step` checks `CI` against that context, and says what is missing;
 * `RI` is unconstrained, so that `Step` tells a factory given uncalled,
 * whose result is a function, from a middleware; each is joined to what
 * the form refuses (`Refuses`: `use` refuses a `validate`). `F1`, the
 * first middleware's type, lets `Rest` refuse a call another form of the
 * method takes.
 */
import type {
	ABound,
	BBound,
	Bound,
	FormName,
	Head,
	Out,
	Reads,
	Refuses,
	Rest,
} from './forms';
import type { LadderLong } from './ladder-long';
import type { AppTypes } from './route-forms';
import type { FunctionLike, MiddlewareReturn, Step } from './types';

type R = MiddlewareReturn;

/** Form `K` with no middleware: `(...head, ...tail)`. */
export type Bare<K extends FormName, App extends AppTypes> = <
	const A extends ABound<K, App>,
	const B extends BBound<K, App>,
	Handled extends Bound<K, App, A, B, []>,
>(
	...args: [
		...Head<K, App, A, B>,
		...Rest<K, App, A, B, [], Handled, FunctionLike>,
	]
) => Out<K, App, A, B, []>;

/**
 * Form `K` with 1 to 8 middlewares, each typed by an overload of its own:
 * 1 to 4 here, 5 to 8 in `LadderLong` (`ladder-long.ts`), whose overloads
 * come after these. Past 8, `TooMany` (`too-many.ts`) says so.
 */
export interface Ladder<K extends FormName, App extends AppTypes>
	extends LadderLong<K, App> {
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		Handled extends Bound<K, App, A, B, [R1]>,
		F1 = FunctionLike,
		C1 = Reads<K, App, A, B, []>,
		R1 = R,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: F1 & Step<Reads<K, App, A, B, []>, C1, R1, Refuses<K, App>>,
			...Rest<K, App, A, B, [R1], Handled, F1>,
		]
	): Out<K, App, A, B, [R1]>;
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		Handled extends Bound<K, App, A, B, [R1, R2]>,
		F1 = FunctionLike,
		C1 = Reads<K, App, A, B, []>,
		R1 = R,
		C2 = Reads<K, App, A, B, [R1]>,
		R2 = R,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: F1 & Step<Reads<K, App, A, B, []>, C1, R1, Refuses<K, App>>,
			m2: Step<Reads<K, App, A, B, [R1]>, C2, R2, Refuses<K, App>>,
			...Rest<K, App, A, B, [R1, R2], Handled, F1>,
		]
	): Out<K, App, A, B, [R1, R2]>;
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		Handled extends Bound<K, App, A, B, [R1, R2, R3]>,
		F1 = FunctionLike,
		C1 = Reads<K, App, A, B, []>,
		R1 = R,
		C2 = Reads<K, App, A, B, [R1]>,
		R2 = R,
		C3 = Reads<K, App, A, B, [R1, R2]>,
		R3 = R,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: F1 & Step<Reads<K, App, A, B, []>, C1, R1, Refuses<K, App>>,
			m2: Step<Reads<K, App, A, B, [R1]>, C2, R2, Refuses<K, App>>,
			m3: Step<Reads<K, App, A, B, [R1, R2]>, C3, R3, Refuses<K, App>>,
			...Rest<K, App, A, B, [R1, R2, R3], Handled, F1>,
		]
	): Out<K, App, A, B, [R1, R2, R3]>;
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		Handled extends Bound<K, App, A, B, [R1, R2, R3, R4]>,
		F1 = FunctionLike,
		C1 = Reads<K, App, A, B, []>,
		R1 = R,
		C2 = Reads<K, App, A, B, [R1]>,
		R2 = R,
		C3 = Reads<K, App, A, B, [R1, R2]>,
		R3 = R,
		C4 = Reads<K, App, A, B, [R1, R2, R3]>,
		R4 = R,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: F1 & Step<Reads<K, App, A, B, []>, C1, R1, Refuses<K, App>>,
			m2: Step<Reads<K, App, A, B, [R1]>, C2, R2, Refuses<K, App>>,
			m3: Step<Reads<K, App, A, B, [R1, R2]>, C3, R3, Refuses<K, App>>,
			m4: Step<Reads<K, App, A, B, [R1, R2, R3]>, C4, R4, Refuses<K, App>>,
			...Rest<K, App, A, B, [R1, R2, R3, R4], Handled, F1>,
		]
	): Out<K, App, A, B, [R1, R2, R3, R4]>;
}
