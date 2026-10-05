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
	Rest,
	Slot,
} from './forms';
import type { AppTypes } from './route-forms';
import type { FunctionLike, MiddlewareReturn } from './types';

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
		F2 = FunctionLike,
		C2 = Reads<K, App, A, B, [R1]>,
		R2 = R,
		F3 = FunctionLike,
		C3 = Reads<K, App, A, B, [R1, R2]>,
		R3 = R,
		F4 = FunctionLike,
		C4 = Reads<K, App, A, B, [R1, R2, R3]>,
		R4 = R,
		F5 = FunctionLike,
		C5 = Reads<K, App, A, B, [R1, R2, R3, R4]>,
		R5 = R,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: Slot<K, App, F1, Reads<K, App, A, B, []>, C1, R1, F1>,
			m2: Slot<K, App, F2, Reads<K, App, A, B, [R1]>, C2, R2>,
			m3: Slot<K, App, F3, Reads<K, App, A, B, [R1, R2]>, C3, R3>,
			m4: Slot<K, App, F4, Reads<K, App, A, B, [R1, R2, R3]>, C4, R4>,
			m5: Slot<K, App, F5, Reads<K, App, A, B, [R1, R2, R3, R4]>, C5, R5>,
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
		F2 = FunctionLike,
		C2 = Reads<K, App, A, B, [R1]>,
		R2 = R,
		F3 = FunctionLike,
		C3 = Reads<K, App, A, B, [R1, R2]>,
		R3 = R,
		F4 = FunctionLike,
		C4 = Reads<K, App, A, B, [R1, R2, R3]>,
		R4 = R,
		F5 = FunctionLike,
		C5 = Reads<K, App, A, B, [R1, R2, R3, R4]>,
		R5 = R,
		F6 = FunctionLike,
		C6 = Reads<K, App, A, B, [R1, R2, R3, R4, R5]>,
		R6 = R,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: Slot<K, App, F1, Reads<K, App, A, B, []>, C1, R1, F1>,
			m2: Slot<K, App, F2, Reads<K, App, A, B, [R1]>, C2, R2>,
			m3: Slot<K, App, F3, Reads<K, App, A, B, [R1, R2]>, C3, R3>,
			m4: Slot<K, App, F4, Reads<K, App, A, B, [R1, R2, R3]>, C4, R4>,
			m5: Slot<K, App, F5, Reads<K, App, A, B, [R1, R2, R3, R4]>, C5, R5>,
			m6: Slot<K, App, F6, Reads<K, App, A, B, [R1, R2, R3, R4, R5]>, C6, R6>,
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
		F2 = FunctionLike,
		C2 = Reads<K, App, A, B, [R1]>,
		R2 = R,
		F3 = FunctionLike,
		C3 = Reads<K, App, A, B, [R1, R2]>,
		R3 = R,
		F4 = FunctionLike,
		C4 = Reads<K, App, A, B, [R1, R2, R3]>,
		R4 = R,
		F5 = FunctionLike,
		C5 = Reads<K, App, A, B, [R1, R2, R3, R4]>,
		R5 = R,
		F6 = FunctionLike,
		C6 = Reads<K, App, A, B, [R1, R2, R3, R4, R5]>,
		R6 = R,
		F7 = FunctionLike,
		C7 = Reads<K, App, A, B, [R1, R2, R3, R4, R5, R6]>,
		R7 = R,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: Slot<K, App, F1, Reads<K, App, A, B, []>, C1, R1, F1>,
			m2: Slot<K, App, F2, Reads<K, App, A, B, [R1]>, C2, R2>,
			m3: Slot<K, App, F3, Reads<K, App, A, B, [R1, R2]>, C3, R3>,
			m4: Slot<K, App, F4, Reads<K, App, A, B, [R1, R2, R3]>, C4, R4>,
			m5: Slot<K, App, F5, Reads<K, App, A, B, [R1, R2, R3, R4]>, C5, R5>,
			m6: Slot<K, App, F6, Reads<K, App, A, B, [R1, R2, R3, R4, R5]>, C6, R6>,
			m7: Slot<
				K,
				App,
				F7,
				Reads<K, App, A, B, [R1, R2, R3, R4, R5, R6]>,
				C7,
				R7
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
		F2 = FunctionLike,
		C2 = Reads<K, App, A, B, [R1]>,
		R2 = R,
		F3 = FunctionLike,
		C3 = Reads<K, App, A, B, [R1, R2]>,
		R3 = R,
		F4 = FunctionLike,
		C4 = Reads<K, App, A, B, [R1, R2, R3]>,
		R4 = R,
		F5 = FunctionLike,
		C5 = Reads<K, App, A, B, [R1, R2, R3, R4]>,
		R5 = R,
		F6 = FunctionLike,
		C6 = Reads<K, App, A, B, [R1, R2, R3, R4, R5]>,
		R6 = R,
		F7 = FunctionLike,
		C7 = Reads<K, App, A, B, [R1, R2, R3, R4, R5, R6]>,
		R7 = R,
		F8 = FunctionLike,
		C8 = Reads<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7]>,
		R8 = R,
	>(
		...args: [
			...Head<K, App, A, B>,
			m1: Slot<K, App, F1, Reads<K, App, A, B, []>, C1, R1, F1>,
			m2: Slot<K, App, F2, Reads<K, App, A, B, [R1]>, C2, R2>,
			m3: Slot<K, App, F3, Reads<K, App, A, B, [R1, R2]>, C3, R3>,
			m4: Slot<K, App, F4, Reads<K, App, A, B, [R1, R2, R3]>, C4, R4>,
			m5: Slot<K, App, F5, Reads<K, App, A, B, [R1, R2, R3, R4]>, C5, R5>,
			m6: Slot<K, App, F6, Reads<K, App, A, B, [R1, R2, R3, R4, R5]>, C6, R6>,
			m7: Slot<
				K,
				App,
				F7,
				Reads<K, App, A, B, [R1, R2, R3, R4, R5, R6]>,
				C7,
				R7
			>,
			m8: Slot<
				K,
				App,
				F8,
				Reads<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7]>,
				C8,
				R8
			>,
			...Rest<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7, R8], Handled, F1>,
		]
	): Out<K, App, A, B, [R1, R2, R3, R4, R5, R6, R7, R8]>;
}
