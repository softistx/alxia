import { data } from 'react-router';
import {
	type ApiErrorLike,
	attemptsLeftOf,
	isApiErrorLike,
	retryAfterOf,
} from '../errors/api-error';
import { INVALID_CODE, MAIL_THROTTLED } from './codes';
import type { CodeWording } from './flow-types';
import { samesitePost } from './guard';
import type {
	StepUpConfirmAnswer,
	StepUpError,
	StepUpRequestAnswer,
	StepUpVia,
} from './model';
import { codeRefusal } from './step';
import { STEP_UP_OVER, STEP_UP_REQUIRED } from './step-up-codes';
import type {
	StepUpStayed,
	StepUpSteps,
	StepUpStepsOptions,
} from './step-up-types';

type Refused = Extract<StepUpConfirmAnswer, { ok: false }>;

interface StepUpContext<L extends string, C> extends CodeWording<L> {
	readonly steps: StepUpStepsOptions<L, C>;
	readonly stepUpRequired: string;
	readonly mailThrottled: string;
}

function resolve<L extends string, C>(
	steps: StepUpStepsOptions<L, C>,
): StepUpContext<L, C> {
	const invalidCode = steps.codes?.invalidCode ?? INVALID_CODE;
	const challengeOver = steps.codes?.challengeOver ?? STEP_UP_OVER;
	if (challengeOver.includes(invalidCode)) {
		throw new TypeError(
			`stepUpSteps(): the code ${JSON.stringify(invalidCode)} is both the wrong-code code (codes.invalidCode) and in codes.challengeOver. A wrong code that leaves tries cannot end the challenge.`,
		);
	}
	return {
		options: steps.signIn,
		steps,
		invalidCode,
		challengeOver,
		stepUpRequired: steps.codes?.stepUpRequired ?? STEP_UP_REQUIRED,
		mailThrottled: steps.codes?.mailThrottled ?? MAIL_THROTTLED,
	};
}

/** The refusal's message: the app's own wording, else `errors`'. */
function worded<L extends string, C>(
	{ steps }: StepUpContext<L, C>,
	error: ApiErrorLike,
	language: L,
): string {
	return (
		steps.wording?.(error, language) ??
		steps.signIn.errors.apiErrorMessage(error, language)
	);
}

/** A code the API refused. With none left, a mailed one is over and an app's is locked. */
function refusedCode<L extends string, C>(
	context: StepUpContext<L, C>,
	error: ApiErrorLike,
	via: StepUpVia | undefined,
	language: L,
): Omit<Refused, 'ok' | 'intent'> {
	const { steps } = context;
	const attemptsLeft = attemptsLeftOf(error);
	if (attemptsLeft === 0 && via !== 'secondFactor') {
		return {
			error: 'expired',
			attemptsLeft,
			locked: false,
			message: steps.spent(language),
		};
	}
	const locked = attemptsLeft === 0;
	const message =
		codeRefusal(
			context,
			error,
			language,
			locked ? steps.locked?.(language) : undefined,
		) ?? steps.signIn.errors.apiErrorMessage(error, language);
	return {
		error: 'invalid',
		...(attemptsLeft === undefined ? {} : { attemptsLeft }),
		locked,
		message,
	};
}

async function requestStep<L extends string, C>(
	context: StepUpContext<L, C>,
	run: Parameters<StepUpSteps<L>['request']>[0],
	{ request, language }: Parameters<StepUpSteps<L>['request']>[1],
): Promise<StepUpRequestAnswer | StepUpStayed<StepUpRequestAnswer>> {
	samesitePost(context.steps.signIn.json, request);
	const intent = 'request-step-up';
	try {
		const { challenge, via } = await run();
		return { ok: true, intent, challenge, via };
	} catch (error) {
		const refusal = context.steps.signIn.errors.apiRefusal(error, language);
		if (!refusal) throw error;
		const api = isApiErrorLike(error);
		const message = api ? worded(context, error, language) : refusal.message;
		const throttled = api && error.code === context.mailThrottled;
		const retryAfter = throttled ? retryAfterOf(error) : undefined;
		return data<StepUpRequestAnswer>(
			{
				ok: false,
				intent,
				error: throttled ? 'throttled' : 'failed',
				message,
				...(retryAfter === undefined ? {} : { retryAfter }),
			},
			{ status: refusal.status },
		);
	}
}

async function confirmStep<L extends string, C>(
	context: StepUpContext<L, C>,
	run: () => Promise<unknown>,
	{ request, language, via }: Parameters<StepUpSteps<L>['confirm']>[1],
): Promise<StepUpConfirmAnswer | StepUpStayed<StepUpConfirmAnswer>> {
	samesitePost(context.steps.signIn.json, request);
	const intent = 'confirm-step-up';
	try {
		await run();
		return { ok: true, intent };
	} catch (error) {
		const refusal = context.steps.signIn.errors.apiRefusal(error, language);
		if (!refusal) throw error;
		const stay = (
			failure: Omit<Refused, 'ok' | 'intent'>,
		): StepUpStayed<StepUpConfirmAnswer> =>
			data<StepUpConfirmAnswer>(
				{ ok: false, intent, ...failure },
				{ status: refusal.status },
			);
		const failed = (message: string) =>
			stay({ error: 'failed' satisfies StepUpError, locked: false, message });
		if (!isApiErrorLike(error)) return failed(refusal.message);
		if (error.code === context.invalidCode) {
			return stay(refusedCode(context, error, via, language));
		}
		if (error.code && context.challengeOver.includes(error.code)) {
			return stay({
				error: 'expired',
				locked: false,
				message: context.steps.spent(language),
			});
		}
		return failed(worded(context, error, language));
	}
}

/**
 * The server side of a BFF's step-up: `request` and `confirm` answer the
 * page's fetcher with `StepUpRequestAnswer` and `StepUpConfirmAnswer`, which
 * `stepUpReducer` takes as they are. It speaks `@nxgt/janus`'s words
 * (`CODE_INVALID`, `TOKEN_*`, `STEP_UP_REQUIRED`); the app maps the rest.
 *
 * @example
 * const stepUp = stepUpSteps({
 * 	errors,
 * 	attemptsLeft: (count, language) => t('code.attempts-left', { count }, language),
 * 	spent: (language) => t('step-up.spent', {}, language),
 * 	locked: (language) => t('step-up.locked', {}, language),
 * });
 */
export function stepUpSteps<L extends string, C = undefined>(
	options: StepUpStepsOptions<L, C>,
): StepUpSteps<L> {
	const context = resolve(options);
	return {
		request: (run, o) => requestStep(context, run, o),
		confirm: (run, o) => confirmStep(context, run, o),
		isStepUpRequired: (error) =>
			isApiErrorLike(error) && error.code === context.stepUpRequired,
	};
}
