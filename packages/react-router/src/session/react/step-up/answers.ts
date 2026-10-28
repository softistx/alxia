import type {
	StepUpConfirmAnswer,
	StepUpRequestAnswer,
} from '../../model/step-up-answers';

const intentOf = (data: unknown) =>
	typeof data === 'object' && data !== null
		? (data as { intent?: unknown }).intent
		: undefined;

/**
 * The step-up route answers both intents from one action, so a fetcher's data
 * is their union: this is the request's answer, or `undefined` for any other.
 */
export function requestAnswerOf(
	data: unknown,
): StepUpRequestAnswer | undefined {
	return intentOf(data) === 'request-step-up'
		? (data as StepUpRequestAnswer)
		: undefined;
}

/** The confirm's answer out of the route's union, or `undefined` for any other. */
export function confirmAnswerOf(
	data: unknown,
): StepUpConfirmAnswer | undefined {
	return intentOf(data) === 'confirm-step-up'
		? (data as StepUpConfirmAnswer)
		: undefined;
}
