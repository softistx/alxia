import type { StepUpVia } from './second-factor';
import type { StepUpState } from './step-up';
import type { StepUpError } from './step-up-answers';

/**
 * The props of `@nxgt/material`'s `VerificationCode` and `StepUpDialog` that
 * the state decides. The state's `message` is not one: the dialog words its
 * own texts from `error`, `attemptsLeft`, `locked` and `retryAfter`. The callbacks (`onSubmit`, `onResend`) are the app's.
 */
export interface StepUpProps {
	readonly via?: StepUpVia;
	readonly attemptsLeft?: number;
	readonly locked: boolean;
	readonly error?: StepUpError;
	/** The seconds to wait when `error` is `throttled` and the API said how long. */
	readonly retryAfter?: number;
	readonly pending: boolean;
	readonly resent: boolean;
}

/** The state as the dialog's props: `{ ...stepUpProps(state), onSubmit, onResend }`. */
export function stepUpProps(state: StepUpState): StepUpProps {
	return {
		...(state.via ? { via: state.via } : {}),
		...(state.attemptsLeft === undefined
			? {}
			: { attemptsLeft: state.attemptsLeft }),
		locked: state.locked,
		...(state.error ? { error: state.error } : {}),
		...(state.retryAfter === undefined ? {} : { retryAfter: state.retryAfter }),
		pending: state.pending,
		resent: state.resent,
	};
}
