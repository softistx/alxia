import type { data } from 'react-router';
import type { ApiErrorLike } from '../errors/api-error';
import type { ApiErrors } from '../errors/api-errors';
import type { SignInCodes } from './flow-types';
import type {
	StepUpConfirmAnswer,
	StepUpRequestAnswer,
	StepUpVia,
} from './model';

/** The codes the step-up tells apart; `@nxgt/janus`'s by default. */
export interface StepUpCodes extends SignInCodes {
	/** The code of a mutation that needs a step-up first (`'STEP_UP_REQUIRED'`). */
	readonly stepUpRequired?: string;
}

export interface StepUpStepsOptions<L extends string> {
	/** The app's `createApiErrors` instance. */
	readonly errors: ApiErrors<L>;
	/** A refused code's tries left, worded ("3 tries left"). */
	attemptsLeft(count: number, language: L): string;
	/** A challenge that is over, worded ("ask for a new code"). */
	spent(language: L): string;
	/**
	 * What an app or recovery code with no try left adds to its message: the
	 * account is locked, wait (asking again would fail too).
	 */
	locked?(language: L): string;
	/**
	 * The app's own words for a refusal that is not a code's (a mail
	 * throttle's wait, say), before `errors`' default. `undefined` keeps the
	 * default.
	 */
	wording?(error: ApiErrorLike, language: L): string | undefined;
	readonly codes?: StepUpCodes;
}

/** An answer that stays on the page: the answer, with the API's status. */
export type StepUpStayed<T> = ReturnType<typeof data<T>>;

export interface StepUpSteps<L extends string> {
	/**
	 * Starts a step-up (`requestStepUp`): the challenge and how it is
	 * confirmed. The challenge goes to the page's fetcher and nowhere else.
	 * A refusal (a throttled mail included) is `error: 'failed'` with the
	 * message and the API's status; an API it cannot reach is a 503. Anything
	 * that is not an API failure is thrown.
	 */
	request(
		run: () => Promise<{ readonly challenge: string; readonly via: StepUpVia }>,
		language: L,
	): Promise<StepUpRequestAnswer | StepUpStayed<StepUpRequestAnswer>>;
	/**
	 * Confirms the step-up with the code (`confirmStepUp`). A refusal says
	 * why: `invalid` with the tries left, `expired` (ask again), or `failed`;
	 * with no try left, a mailed code (`via: 'email'`, or not given) is
	 * `expired` and an app or recovery code is `locked`.
	 */
	confirm(
		run: () => Promise<unknown>,
		options: { readonly via?: StepUpVia },
		language: L,
	): Promise<StepUpConfirmAnswer | StepUpStayed<StepUpConfirmAnswer>>;
	/** Whether `error` is the API asking for a step-up first. */
	isStepUpRequired(error: unknown): boolean;
}
