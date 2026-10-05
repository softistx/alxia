/**
 * The overloads of `Ladder` (`ladder.ts`) with 5 to 8 middlewares, after
 * its own 1 to 4: an interface's own call signatures come before those it
 * extends, so the overloads stay in order.
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
import type { AppTypes } from './route-forms';
import type { FunctionLike, MiddlewareReturn, Step } from './types';

type R = MiddlewareReturn;

/** Form `K` with 5 to 8 middlewares. */
export interface LadderLong<K extends FormName, App extends AppTypes> {
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		Handled extends Bound<K, App, A, B, [R1, R2, R3, R4, R5]>,
		F1 = FunctionLike,
		C1 = Reads<K, App, A, B, []>,
		R1 = R,
		C2 = Reads<K, App, A, B, [R1]>,
		R2 = R,
		C3 = Reads<K, App, A, B, [R1, R2]>,
		R3 = R,
		C4 = Reads<K, App, A, B, [R1, R2, R3]>,
		R4 = R,
		C5 = Reads<K, App, A, B, [R1, R2, R3, R4]>,
		R5 = R,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: F1 & Step<Reads<K, App, A, B, []>, C1, R1, Refuses<K, App>>,
			m2: Step<Reads<K, App, A, B, [R1]>, C2, R2, Refuses<K, App>>,
			m3: Step<Reads<K, App, A, B, [R1, R2]>, C3, R3, Refuses<K, App>>,
			m4: Step<Reads<K, App, A, B, [R1, R2, R3]>, C4, R4, Refuses<K, App>>,
			m5: Step<Reads<K, App, A, B, [R1, R2, R3, R4]>, C5, R5, Refuses<K, App>>,
			...Rest<K, App, A, B, [R1, R2, R3, R4, R5], Handled, F1>,
		]
	): Out<K, App, A, B, [R1, R2, R3, R4, R5]>;
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		Handled extends Bound<K, App, A, B, [R1, R2, R3, R4, R5, R6]>,
		F1 = FunctionLike,
		C1 = Reads<K, App, A, B, []>,
		R1 = R,
		C2 = Reads<K, App, A, B, [R1]>,
		R2 = R,
		C3 = Reads<K, App, A, B, [R1, R2]>,
		R3 = R,
		C4 = Reads<K, App, A, B, [R1, R2, R3]>,
		R4 = R,
		C5 = Reads<K, App, A, B, [R1, R2, R3, R4]>,
		R5 = R,
		C6 = Reads<K, App, A, B, [R1, R2, R3, R4, R5]>,
		R6 = R,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: F1 & Step<Reads<K, App, A, B, []>, C1, R1, Refuses<K, App>>,
			m2: Step<Reads<K, App, A, B, [R1]>, C2, R2, Refuses<K, App>>,
			m3: Step<Reads<K, App, A, B, [R1, R2]>, C3, R3, Refuses<K, App>>,
			m4: Step<Reads<K, App, A, B, [R1, R2, R3]>, C4, R4, Refuses<K, App>>,
			m5: Step<Reads<K, App, A, B, [R1, R2, R3, R4]>, C5, R5, Refuses<K, App>>,
			m6: Step<
				Reads<K, App, A, B, [R1, R2, R3, R4, R5]>,
				C6,
				R6,
				Refuses<K, App>
			>,
			...Rest<K, App, A, B, [R1, R2, R3, R4, R5, R6], Handled, F1>,
		]
	): Out<K, App, A, B, [R1, R2, R3, R4, R5, R6]>;
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		Handled extends Bound<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7]>,
		F1 = FunctionLike,
		C1 = Reads<K, App, A, B, []>,
		R1 = R,
		C2 = Reads<K, App, A, B, [R1]>,
		R2 = R,
		C3 = Reads<K, App, A, B, [R1, R2]>,
		R3 = R,
		C4 = Reads<K, App, A, B, [R1, R2, R3]>,
		R4 = R,
		C5 = Reads<K, App, A, B, [R1, R2, R3, R4]>,
		R5 = R,
		C6 = Reads<K, App, A, B, [R1, R2, R3, R4, R5]>,
		R6 = R,
		C7 = Reads<K, App, A, B, [R1, R2, R3, R4, R5, R6]>,
		R7 = R,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: F1 & Step<Reads<K, App, A, B, []>, C1, R1, Refuses<K, App>>,
			m2: Step<Reads<K, App, A, B, [R1]>, C2, R2, Refuses<K, App>>,
			m3: Step<Reads<K, App, A, B, [R1, R2]>, C3, R3, Refuses<K, App>>,
			m4: Step<Reads<K, App, A, B, [R1, R2, R3]>, C4, R4, Refuses<K, App>>,
			m5: Step<Reads<K, App, A, B, [R1, R2, R3, R4]>, C5, R5, Refuses<K, App>>,
			m6: Step<
				Reads<K, App, A, B, [R1, R2, R3, R4, R5]>,
				C6,
				R6,
				Refuses<K, App>
			>,
			m7: Step<
				Reads<K, App, A, B, [R1, R2, R3, R4, R5, R6]>,
				C7,
				R7,
				Refuses<K, App>
			>,
			...Rest<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7], Handled, F1>,
		]
	): Out<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7]>;
	<
		const A extends ABound<K, App>,
		const B extends BBound<K, App>,
		Handled extends Bound<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7, R8]>,
		F1 = FunctionLike,
		C1 = Reads<K, App, A, B, []>,
		R1 = R,
		C2 = Reads<K, App, A, B, [R1]>,
		R2 = R,
		C3 = Reads<K, App, A, B, [R1, R2]>,
		R3 = R,
		C4 = Reads<K, App, A, B, [R1, R2, R3]>,
		R4 = R,
		C5 = Reads<K, App, A, B, [R1, R2, R3, R4]>,
		R5 = R,
		C6 = Reads<K, App, A, B, [R1, R2, R3, R4, R5]>,
		R6 = R,
		C7 = Reads<K, App, A, B, [R1, R2, R3, R4, R5, R6]>,
		R7 = R,
		C8 = Reads<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7]>,
		R8 = R,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: F1 & Step<Reads<K, App, A, B, []>, C1, R1, Refuses<K, App>>,
			m2: Step<Reads<K, App, A, B, [R1]>, C2, R2, Refuses<K, App>>,
			m3: Step<Reads<K, App, A, B, [R1, R2]>, C3, R3, Refuses<K, App>>,
			m4: Step<Reads<K, App, A, B, [R1, R2, R3]>, C4, R4, Refuses<K, App>>,
			m5: Step<Reads<K, App, A, B, [R1, R2, R3, R4]>, C5, R5, Refuses<K, App>>,
			m6: Step<
				Reads<K, App, A, B, [R1, R2, R3, R4, R5]>,
				C6,
				R6,
				Refuses<K, App>
			>,
			m7: Step<
				Reads<K, App, A, B, [R1, R2, R3, R4, R5, R6]>,
				C7,
				R7,
				Refuses<K, App>
			>,
			m8: Step<
				Reads<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7]>,
				C8,
				R8,
				Refuses<K, App>
			>,
			...Rest<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7, R8], Handled, F1>,
		]
	): Out<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7, R8]>;
}
