import type { data } from 'react-router';
import type { ApiErrorLike } from '../errors/api-error';
import type { SignInCodes, SignInFlow } from './flow-types';
import type {
	StepUpConfirmAnswer,
	StepUpRequestAnswer,
	StepUpVia,
} from './model';

/** The codes the step-up tells apart; `@nxgt/janus`'s by default. */
export interface StepUpCodes extends SignInCodes {
	/** The code of a mutation that needs a step-up first (`'STEP_UP_REQUIRED'`). */
	readonly stepUpRequired?: string | undefined;
	/** The code of a mail the API holds back (`'MAIL_THROTTLED'`): `request` answers `error: 'throttled'`. */
	readonly mailThrottled?: string | undefined;
}

export interface StepUpStepsOptions<L extends string> {
	/**
	 * The app's sign-in flow: the step-up reads its `errors`, its `json` (a
	 * step runs only for a same-site JSON post) and its `attemptsLeft`.
	 */
	readonly signIn: SignInFlow<L>;
	/** A challenge that is over, worded ("ask for a new code"). */
	spent(language: L): string;
	/**
	 * What an app or recovery code with no try left adds to its message: the
	 * account is locked, wait (asking again would fail too).
	 */
	readonly locked?: ((language: L) => string) | undefined;
	/**
	 * The app's own words for a refusal that is not a code's (a mail
	 * throttle's wait, say), before `errors`' default. `undefined` keeps the
	 * default.
	 */
	readonly wording?:
		| ((error: ApiErrorLike, language: L) => string | undefined)
		| undefined;
	readonly codes?: StepUpCodes | undefined;
}

/** An answer that stays on the page: the answer, with the API's status. */
export type StepUpStayed<T> = ReturnType<typeof data<T>>;

/**
 * What each step takes beside `run`: the request, whose headers must be a
 * same-site JSON post's (a native form post goes back to its page, another
 * site is a 403), and the language of the wording.
 */
export interface StepUpCall<L extends string> {
	readonly request: Request;
	readonly language: L;
}

export interface StepUpSteps<L extends string> {
	/**
	 * Starts a step-up (`requestStepUp`): the challenge and how it is
	 * confirmed. The challenge goes to the page's fetcher and nowhere else.
	 * A refusal is `error: 'failed'` with the
	 * message and the API's status, and a throttled mail `error: 'throttled'`,
	 * with `retryAfter` when the API says how long; an API it cannot reach is a 503. Anything
	 * that is not an API failure is thrown. Only a same-site JSON post goes on.
	 */
	request(
		run: () => Promise<{ readonly challenge: string; readonly via: StepUpVia }>,
		options: StepUpCall<L>,
	): Promise<StepUpRequestAnswer | StepUpStayed<StepUpRequestAnswer>>;
	/**
	 * Confirms the step-up with the code (`confirmStepUp`). A refusal says
	 * why: `invalid` with the tries left, `expired` (ask again), or `failed`;
	 * with no try left, a mailed code (`via: 'email'`, or not given) is
	 * `expired` and an app or recovery code is `locked`.
	 */
	confirm(
		run: () => Promise<unknown>,
		options: StepUpCall<L> & { readonly via?: StepUpVia | undefined },
	): Promise<StepUpConfirmAnswer | StepUpStayed<StepUpConfirmAnswer>>;
	/** Whether `error` is the API asking for a step-up first. */
	isStepUpRequired(error: unknown): boolean;
}
