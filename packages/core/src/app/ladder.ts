/**
 * The one shape every middleware form is written in: `(...head, m1, …,
 * mN, ...tail)`, `N` up to 8, each middleware reading what the ones before
 * it added. A form — a route method's, `ws`'s, `route(operation)`'s,
 * `use`'s — names its slots in `Forms` (`forms.ts`); `Bare` and `Ladder`
 * lay its overloads out from them, so that the forms cannot drift apart.
 * The middlewares are written out, `m1` to `m8`: TypeScript prints their
 * names in the overloads it reports.
 */
import type {
	ABound,
	BBound,
	Bound,
	FormName,
	Head,
	Out,
	Step,
	Tail,
} from './forms';
import type { AppTypes } from './route-forms';
import type { MiddlewareReturn } from './types';

type R = MiddlewareReturn;

/** Form `K` with no middleware: `(...head, ...tail)`. */
export type Bare<K extends FormName, App extends AppTypes> = <
	const A extends ABound<K, App>,
	const B extends BBound<K, App>,
	Handled extends Bound<K, App, A, B, []>,
>(
	...args: [...Head<K, App, A, B>, ...Tail<K, App, A, B, [], Handled>]
) => Out<K, App, A, B, []>;

/**
 * Form `K` with 1 to 8 middlewares: past 8, the call is refused, since
 * each middleware is typed by an overload of its own.
 */
export interface Ladder<K extends FormName, App extends AppTypes> {
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		R1 extends R,
		Handled extends Bound<K, App, A, B, [R1]>,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: Step<K, App, A, B, [], R1>,
			...Tail<K, App, A, B, [R1], Handled>,
		]
	): Out<K, App, A, B, [R1]>;
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		R1 extends R,
		R2 extends R,
		Handled extends Bound<K, App, A, B, [R1, R2]>,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: Step<K, App, A, B, [], R1>,
			m2: Step<K, App, A, B, [R1], R2>,
			...Tail<K, App, A, B, [R1, R2], Handled>,
		]
	): Out<K, App, A, B, [R1, R2]>;
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		R1 extends R,
		R2 extends R,
		R3 extends R,
		Handled extends Bound<K, App, A, B, [R1, R2, R3]>,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: Step<K, App, A, B, [], R1>,
			m2: Step<K, App, A, B, [R1], R2>,
			m3: Step<K, App, A, B, [R1, R2], R3>,
			...Tail<K, App, A, B, [R1, R2, R3], Handled>,
		]
	): Out<K, App, A, B, [R1, R2, R3]>;
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		R1 extends R,
		R2 extends R,
		R3 extends R,
		R4 extends R,
		Handled extends Bound<K, App, A, B, [R1, R2, R3, R4]>,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: Step<K, App, A, B, [], R1>,
			m2: Step<K, App, A, B, [R1], R2>,
			m3: Step<K, App, A, B, [R1, R2], R3>,
			m4: Step<K, App, A, B, [R1, R2, R3], R4>,
			...Tail<K, App, A, B, [R1, R2, R3, R4], Handled>,
		]
	): Out<K, App, A, B, [R1, R2, R3, R4]>;
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		R1 extends R,
		R2 extends R,
		R3 extends R,
		R4 extends R,
		R5 extends R,
		Handled extends Bound<K, App, A, B, [R1, R2, R3, R4, R5]>,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: Step<K, App, A, B, [], R1>,
			m2: Step<K, App, A, B, [R1], R2>,
			m3: Step<K, App, A, B, [R1, R2], R3>,
			m4: Step<K, App, A, B, [R1, R2, R3], R4>,
			m5: Step<K, App, A, B, [R1, R2, R3, R4], R5>,
			...Tail<K, App, A, B, [R1, R2, R3, R4, R5], Handled>,
		]
	): Out<K, App, A, B, [R1, R2, R3, R4, R5]>;
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		R1 extends R,
		R2 extends R,
		R3 extends R,
		R4 extends R,
		R5 extends R,
		R6 extends R,
		Handled extends Bound<K, App, A, B, [R1, R2, R3, R4, R5, R6]>,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: Step<K, App, A, B, [], R1>,
			m2: Step<K, App, A, B, [R1], R2>,
			m3: Step<K, App, A, B, [R1, R2], R3>,
			m4: Step<K, App, A, B, [R1, R2, R3], R4>,
			m5: Step<K, App, A, B, [R1, R2, R3, R4], R5>,
			m6: Step<K, App, A, B, [R1, R2, R3, R4, R5], R6>,
			...Tail<K, App, A, B, [R1, R2, R3, R4, R5, R6], Handled>,
		]
	): Out<K, App, A, B, [R1, R2, R3, R4, R5, R6]>;
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		R1 extends R,
		R2 extends R,
		R3 extends R,
		R4 extends R,
		R5 extends R,
		R6 extends R,
		R7 extends R,
		Handled extends Bound<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7]>,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: Step<K, App, A, B, [], R1>,
			m2: Step<K, App, A, B, [R1], R2>,
			m3: Step<K, App, A, B, [R1, R2], R3>,
			m4: Step<K, App, A, B, [R1, R2, R3], R4>,
			m5: Step<K, App, A, B, [R1, R2, R3, R4], R5>,
			m6: Step<K, App, A, B, [R1, R2, R3, R4, R5], R6>,
			m7: Step<K, App, A, B, [R1, R2, R3, R4, R5, R6], R7>,
			...Tail<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7], Handled>,
		]
	): Out<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7]>;
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		R1 extends R,
		R2 extends R,
		R3 extends R,
		R4 extends R,
		R5 extends R,
		R6 extends R,
		R7 extends R,
		R8 extends R,
		Handled extends Bound<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7, R8]>,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: Step<K, App, A, B, [], R1>,
			m2: Step<K, App, A, B, [R1], R2>,
			m3: Step<K, App, A, B, [R1, R2], R3>,
			m4: Step<K, App, A, B, [R1, R2, R3], R4>,
			m5: Step<K, App, A, B, [R1, R2, R3, R4], R5>,
			m6: Step<K, App, A, B, [R1, R2, R3, R4, R5], R6>,
			m7: Step<K, App, A, B, [R1, R2, R3, R4, R5, R6], R7>,
			m8: Step<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7], R8>,
			...Tail<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7, R8], Handled>,
		]
	): Out<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7, R8]>;
}
