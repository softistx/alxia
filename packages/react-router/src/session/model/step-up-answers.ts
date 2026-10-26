import type { StepUpVia } from './second-factor';

/** Why a step-up step failed: a wrong code, a challenge gone, or anything else. */
export type StepUpError = 'invalid' | 'expired' | 'failed';

/** What the server answers to a request for a challenge. */
export type StepUpRequestAnswer =
	| {
			readonly ok: true;
			readonly intent: 'request-step-up';
			readonly challenge: string;
			readonly via: StepUpVia;
	  }
	| {
			readonly ok: false;
			readonly intent: 'request-step-up';
			readonly error: StepUpError;
	  };

/**
 * What the server answers to a code. `attemptsLeft` is the tries a refused
 * code leaves; `locked` says the account's lockout is on, so asking again
 * would fail too.
 */
export type StepUpConfirmAnswer =
	| { readonly ok: true; readonly intent: 'confirm-step-up' }
	| {
			readonly ok: false;
			readonly intent: 'confirm-step-up';
			readonly error: StepUpError;
			readonly attemptsLeft?: number;
			readonly locked: boolean;
	  };
