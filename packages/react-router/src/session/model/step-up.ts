import type { StepUpVia } from './second-factor';
import type {
	StepUpConfirmAnswer,
	StepUpError,
	StepUpRequestAnswer,
} from './step-up-answers';

/** Where a step-up is. */
export type StepUpPhase =
	| 'idle'
	| 'requesting'
	| 'code'
	| 'confirming'
	| 'done';

export interface StepUpState {
	readonly phase: StepUpPhase;
	/** How the challenge held (or the last one) is confirmed. */
	readonly via?: StepUpVia | undefined;
	/** The challenge held. A secret: never in a URL, a log or loader data. */
	readonly challenge?: string | undefined;
	/** The tries the last refused code left. */
	readonly attemptsLeft?: number | undefined;
	/** No try left on an app or recovery code: wait, asking again would fail too. */
	readonly locked: boolean;
	readonly error?: StepUpError | undefined;
	/** The last refusal worded for the page, until the next step or the release. */
	readonly message?: string | undefined;
	/** The seconds a throttled request asks to wait before asking again. */
	readonly retryAfter?: number | undefined;
	/** A request or a code is in flight. */
	readonly pending: boolean;
	/** The last request replaced a challenge that was held. */
	readonly resent: boolean;
}

export type StepUpAction =
	| { readonly type: 'start' }
	| { readonly type: 'requested'; readonly answer: StepUpRequestAnswer }
	| { readonly type: 'submit' }
	| { readonly type: 'confirmed'; readonly answer: StepUpConfirmAnswer }
	| { readonly type: 'release' };

export const INITIAL_STEP_UP: StepUpState = {
	phase: 'idle',
	locked: false,
	pending: false,
	resent: false,
};

function requested(
	state: StepUpState,
	answer: StepUpRequestAnswer,
): StepUpState {
	if (!answer.ok) {
		// A resend refused leaves the code form up, and says why in it.
		return {
			...state,
			phase: state.challenge ? 'code' : 'idle',
			error: answer.error,
			message: answer.message,
			retryAfter: answer.retryAfter,
			pending: false,
			resent: false,
		};
	}
	return {
		phase: 'code',
		via: answer.via,
		challenge: answer.challenge,
		locked: false,
		pending: false,
		resent: state.challenge !== undefined,
	};
}

/** A refused code. At 0 tries left a mailed code is over (ask again), an app or recovery code is locked (wait). */
function refused(
	state: StepUpState,
	answer: Extract<StepUpConfirmAnswer, { ok: false }>,
): StepUpState {
	const none = answer.attemptsLeft === 0;
	const over = answer.error === 'expired' || (none && state.via === 'email');
	if (over) {
		return {
			phase: 'idle',
			...(state.via ? { via: state.via } : {}),
			locked: false,
			error: 'expired',
			message: answer.message,
			pending: false,
			resent: false,
		};
	}
	return {
		...state,
		phase: 'code',
		error: answer.error,
		message: answer.message,
		retryAfter: undefined,
		attemptsLeft: answer.attemptsLeft,
		locked: answer.locked || none,
		pending: false,
		resent: false,
	};
}

/**
 * The step-up's transitions, pure. `start` (a request in flight) forgets the
 * last error but keeps a challenge held, so a refused "Resend code" leaves
 * the code form up; a refusal keeps its `message` (and a throttle its
 * `retryAfter`) until the next step; a granted request replaces the challenge; a code accepted
 * spends it; an expired or spent one leaves "ask again"; at 0 tries left a
 * mailed code is `expired` and an app or recovery code is `locked`.
 */
export function stepUpReducer(
	state: StepUpState,
	action: StepUpAction,
): StepUpState {
	switch (action.type) {
		case 'start':
			return {
				...state,
				phase: state.challenge ? 'code' : 'requesting',
				error: undefined,
				message: undefined,
				retryAfter: undefined,
				pending: true,
				resent: false,
			};
		case 'requested':
			return requested(state, action.answer);
		case 'submit':
			return {
				...state,
				phase: 'confirming',
				error: undefined,
				message: undefined,
				retryAfter: undefined,
				pending: true,
			};
		case 'confirmed':
			return action.answer.ok
				? {
						phase: 'done',
						...(state.via ? { via: state.via } : {}),
						locked: false,
						pending: false,
						resent: false,
					}
				: refused(state, action.answer);
		case 'release':
			return INITIAL_STEP_UP;
	}
}
