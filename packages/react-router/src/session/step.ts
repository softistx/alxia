import { data } from 'react-router';
import {
	type ApiErrorLike,
	attemptsLeftOf,
	isApiErrorLike,
} from '../errors/api-error';
import type {
	CodeWording,
	FlowContext,
	SignInAnswer,
	SignInFlow,
	SignInFormError,
	SignInStayed,
} from './flow-types';
import { samesitePost } from './guard';
import { landReplacing } from './land';

/**
 * A refused code's message, with the tries left when the API counts them;
 * `undefined` when the challenge is over (gone, or no try left and no
 * `whenNone` to say instead) and the user must sign in again.
 */
export function codeRefusal<L extends string>(
	{ options, invalidCode, challengeOver }: CodeWording<L>,
	error: ApiErrorLike,
	language: L,
	whenNone?: string,
): string | undefined {
	if (error.code !== invalidCode) {
		return error.code && challengeOver.includes(error.code)
			? undefined
			: options.errors.apiErrorMessage(error, language);
	}
	const message = options.errors.apiErrorMessage(error, language);
	const count = attemptsLeftOf(error);
	if (count === undefined) return message;
	if (count === 0) {
		return whenNone === undefined ? undefined : `${message} ${whenNone}`;
	}
	return `${message} ${options.attemptsLeft(count, language)}`;
}

/**
 * Runs a sign-in step and redirects where its answer leads, a new session
 * replacing the browser's (`landReplacing`). A refusal is the form's
 * message (a wrong password, a lock with its delay); an unreachable API
 * says `unavailable`, with a 503.
 */
export async function signInStep<L extends string, T extends object>(
	context: FlowContext<L>,
	run: () => Promise<SignInAnswer>,
	{
		request,
		language,
		next,
		extra,
		refused,
	}: Parameters<SignInFlow<L>['signInStep']>[1] & { extra: T },
): Promise<Response | SignInStayed<T>> {
	const { errors, unavailable, json } = context.options;
	// A cross-site post must never sign in or revoke (headers only).
	samesitePost(json, request);
	const stay = (formError: string, status: number) =>
		data<SignInFormError<T>>({ ...extra, formError }, { status });
	const unreachable = () =>
		stay(
			unavailable ? unavailable(language) : errors.unavailableMessage(language),
			503,
		);
	let answer: SignInAnswer;
	try {
		answer = await run();
	} catch (error) {
		const refusal = errors.apiRefusal(error, language);
		if (!refusal) throw error;
		// An API it cannot reach: sign-in's own words.
		if (!isApiErrorLike(error)) return unreachable();
		const own = refused?.(error);
		if (own instanceof Response) return own;
		return stay(own ?? refusal.message, refusal.status);
	}
	return (
		(await landReplacing(context, answer, next, { request })) ?? unreachable()
	);
}
