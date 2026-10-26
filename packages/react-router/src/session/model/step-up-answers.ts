import type { StepUpVia } from './second-factor';

/**
 * Why a step-up step failed: a wrong code, a challenge gone, a request held
 * back for asking too often (`throttled`: a mail the API holds back or a rate
 * limit, a 429, with `retryAfter` when the API says how long), or anything
 * else.
 */
export type StepUpError = 'invalid' | 'expired' | 'failed' | 'throttled';

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
			/** The refusal worded for the page, in its language. */
			readonly message?: string | undefined;
			/** The seconds to wait before asking again (a whole number from 0), when `error` is `throttled` and the API says. */
			readonly retryAfter?: number | undefined;
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
			readonly attemptsLeft?: number | undefined;
			readonly locked: boolean;
			/** The refusal worded for the page, in its language. */
			readonly message?: string | undefined;
			/** The seconds to wait before trying again (a whole number from 0), when `error` is `throttled` and the API says. */
			readonly retryAfter?: number | undefined;
	  };
