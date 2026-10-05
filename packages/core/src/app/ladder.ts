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
 * `F1`, the first middleware's type, lets `Rest` refuse a call another
 * form of the method takes.
 */
import type {
	ABound,
	BBound,
	Bound,
	FormName,
	Head,
	Out,
	Reads,
	Rest,
} from './forms';
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
 * Form `K` with 1 to 8 middlewares: past 8, the call is refused, since
 * each middleware is typed by an overload of its own.
 */
export interface Ladder<K extends FormName, App extends AppTypes> {
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		Handled extends Bound<K, App, A, B, [R1]>,
		F1 = FunctionLike,
		C1 = Reads<K, App, A, B, []>,
		R1 extends R = R,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: F1 & Step<Reads<K, App, A, B, []>, C1, R1>,
			...Rest<K, App, A, B, [R1], Handled, F1>,
		]
	): Out<K, App, A, B, [R1]>;
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		Handled extends Bound<K, App, A, B, [R1, R2]>,
		F1 = FunctionLike,
		C1 = Reads<K, App, A, B, []>,
		R1 extends R = R,
		C2 = Reads<K, App, A, B, [R1]>,
		R2 extends R = R,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: F1 & Step<Reads<K, App, A, B, []>, C1, R1>,
			m2: Step<Reads<K, App, A, B, [R1]>, C2, R2>,
			...Rest<K, App, A, B, [R1, R2], Handled, F1>,
		]
	): Out<K, App, A, B, [R1, R2]>;
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		Handled extends Bound<K, App, A, B, [R1, R2, R3]>,
		F1 = FunctionLike,
		C1 = Reads<K, App, A, B, []>,
		R1 extends R = R,
		C2 = Reads<K, App, A, B, [R1]>,
		R2 extends R = R,
		C3 = Reads<K, App, A, B, [R1, R2]>,
		R3 extends R = R,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: F1 & Step<Reads<K, App, A, B, []>, C1, R1>,
			m2: Step<Reads<K, App, A, B, [R1]>, C2, R2>,
			m3: Step<Reads<K, App, A, B, [R1, R2]>, C3, R3>,
			...Rest<K, App, A, B, [R1, R2, R3], Handled, F1>,
		]
	): Out<K, App, A, B, [R1, R2, R3]>;
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		Handled extends Bound<K, App, A, B, [R1, R2, R3, R4]>,
		F1 = FunctionLike,
		C1 = Reads<K, App, A, B, []>,
		R1 extends R = R,
		C2 = Reads<K, App, A, B, [R1]>,
		R2 extends R = R,
		C3 = Reads<K, App, A, B, [R1, R2]>,
		R3 extends R = R,
		C4 = Reads<K, App, A, B, [R1, R2, R3]>,
		R4 extends R = R,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: F1 & Step<Reads<K, App, A, B, []>, C1, R1>,
			m2: Step<Reads<K, App, A, B, [R1]>, C2, R2>,
			m3: Step<Reads<K, App, A, B, [R1, R2]>, C3, R3>,
			m4: Step<Reads<K, App, A, B, [R1, R2, R3]>, C4, R4>,
			...Rest<K, App, A, B, [R1, R2, R3, R4], Handled, F1>,
		]
	): Out<K, App, A, B, [R1, R2, R3, R4]>;
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		Handled extends Bound<K, App, A, B, [R1, R2, R3, R4, R5]>,
		F1 = FunctionLike,
		C1 = Reads<K, App, A, B, []>,
		R1 extends R = R,
		C2 = Reads<K, App, A, B, [R1]>,
		R2 extends R = R,
		C3 = Reads<K, App, A, B, [R1, R2]>,
		R3 extends R = R,
		C4 = Reads<K, App, A, B, [R1, R2, R3]>,
		R4 extends R = R,
		C5 = Reads<K, App, A, B, [R1, R2, R3, R4]>,
		R5 extends R = R,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: F1 & Step<Reads<K, App, A, B, []>, C1, R1>,
			m2: Step<Reads<K, App, A, B, [R1]>, C2, R2>,
			m3: Step<Reads<K, App, A, B, [R1, R2]>, C3, R3>,
			m4: Step<Reads<K, App, A, B, [R1, R2, R3]>, C4, R4>,
			m5: Step<Reads<K, App, A, B, [R1, R2, R3, R4]>, C5, R5>,
			...Rest<K, App, A, B, [R1, R2, R3, R4, R5], Handled, F1>,
		]
	): Out<K, App, A, B, [R1, R2, R3, R4, R5]>;
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		Handled extends Bound<K, App, A, B, [R1, R2, R3, R4, R5, R6]>,
		F1 = FunctionLike,
		C1 = Reads<K, App, A, B, []>,
		R1 extends R = R,
		C2 = Reads<K, App, A, B, [R1]>,
		R2 extends R = R,
		C3 = Reads<K, App, A, B, [R1, R2]>,
		R3 extends R = R,
		C4 = Reads<K, App, A, B, [R1, R2, R3]>,
		R4 extends R = R,
		C5 = Reads<K, App, A, B, [R1, R2, R3, R4]>,
		R5 extends R = R,
		C6 = Reads<K, App, A, B, [R1, R2, R3, R4, R5]>,
		R6 extends R = R,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: F1 & Step<Reads<K, App, A, B, []>, C1, R1>,
			m2: Step<Reads<K, App, A, B, [R1]>, C2, R2>,
			m3: Step<Reads<K, App, A, B, [R1, R2]>, C3, R3>,
			m4: Step<Reads<K, App, A, B, [R1, R2, R3]>, C4, R4>,
			m5: Step<Reads<K, App, A, B, [R1, R2, R3, R4]>, C5, R5>,
			m6: Step<Reads<K, App, A, B, [R1, R2, R3, R4, R5]>, C6, R6>,
			...Rest<K, App, A, B, [R1, R2, R3, R4, R5, R6], Handled, F1>,
		]
	): Out<K, App, A, B, [R1, R2, R3, R4, R5, R6]>;
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		Handled extends Bound<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7]>,
		F1 = FunctionLike,
		C1 = Reads<K, App, A, B, []>,
		R1 extends R = R,
		C2 = Reads<K, App, A, B, [R1]>,
		R2 extends R = R,
		C3 = Reads<K, App, A, B, [R1, R2]>,
		R3 extends R = R,
		C4 = Reads<K, App, A, B, [R1, R2, R3]>,
		R4 extends R = R,
		C5 = Reads<K, App, A, B, [R1, R2, R3, R4]>,
		R5 extends R = R,
		C6 = Reads<K, App, A, B, [R1, R2, R3, R4, R5]>,
		R6 extends R = R,
		C7 = Reads<K, App, A, B, [R1, R2, R3, R4, R5, R6]>,
		R7 extends R = R,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: F1 & Step<Reads<K, App, A, B, []>, C1, R1>,
			m2: Step<Reads<K, App, A, B, [R1]>, C2, R2>,
			m3: Step<Reads<K, App, A, B, [R1, R2]>, C3, R3>,
			m4: Step<Reads<K, App, A, B, [R1, R2, R3]>, C4, R4>,
			m5: Step<Reads<K, App, A, B, [R1, R2, R3, R4]>, C5, R5>,
			m6: Step<Reads<K, App, A, B, [R1, R2, R3, R4, R5]>, C6, R6>,
			m7: Step<Reads<K, App, A, B, [R1, R2, R3, R4, R5, R6]>, C7, R7>,
			...Rest<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7], Handled, F1>,
		]
	): Out<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7]>;
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		Handled extends Bound<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7, R8]>,
		F1 = FunctionLike,
		C1 = Reads<K, App, A, B, []>,
		R1 extends R = R,
		C2 = Reads<K, App, A, B, [R1]>,
		R2 extends R = R,
		C3 = Reads<K, App, A, B, [R1, R2]>,
		R3 extends R = R,
		C4 = Reads<K, App, A, B, [R1, R2, R3]>,
		R4 extends R = R,
		C5 = Reads<K, App, A, B, [R1, R2, R3, R4]>,
		R5 extends R = R,
		C6 = Reads<K, App, A, B, [R1, R2, R3, R4, R5]>,
		R6 extends R = R,
		C7 = Reads<K, App, A, B, [R1, R2, R3, R4, R5, R6]>,
		R7 extends R = R,
		C8 = Reads<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7]>,
		R8 extends R = R,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: F1 & Step<Reads<K, App, A, B, []>, C1, R1>,
			m2: Step<Reads<K, App, A, B, [R1]>, C2, R2>,
			m3: Step<Reads<K, App, A, B, [R1, R2]>, C3, R3>,
			m4: Step<Reads<K, App, A, B, [R1, R2, R3]>, C4, R4>,
			m5: Step<Reads<K, App, A, B, [R1, R2, R3, R4]>, C5, R5>,
			m6: Step<Reads<K, App, A, B, [R1, R2, R3, R4, R5]>, C6, R6>,
			m7: Step<Reads<K, App, A, B, [R1, R2, R3, R4, R5, R6]>, C7, R7>,
			m8: Step<Reads<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7]>, C8, R8>,
			...Rest<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7, R8], Handled, F1>,
		]
	): Out<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7, R8]>;
}
