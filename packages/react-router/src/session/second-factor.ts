import { data } from 'react-router';
import type { FlowContext, SignInAnswer, SignInFlow } from './flow-types';
import { samesitePost } from './guard';
import type { SecondFactorKind } from './model';

const MAX_CODE = 40;

function isMethod(value: unknown): value is SecondFactorKind {
	return value === 'code' || value === 'recovery';
}

/**
 * The code a second-factor page posted, with how it is given
 * (`{ kind: 'code' | 'recovery', code }`, the code at most 40 characters). A
 * native form post goes back to its page, which then posts JSON; a
 * cross-site post is a 403; a body of another shape is a 400.
 */
export async function readCodeInput<L extends string, C>(
	{ options }: FlowContext<L, C>,
	request: Request,
): Promise<{ kind: SecondFactorKind; code: string }> {
	samesitePost(options.json, request);
	const body = (await options.json.readJson(request)) as {
		kind?: unknown;
		code?: unknown;
	} | null;
	const { kind, code } = body ?? {};
	if (!isMethod(kind) || typeof code !== 'string' || code.length > MAX_CODE) {
		throw data('Bad code request', { status: 400 });
	}
	return { kind, code };
}

/**
 * The code against the sign-in's challenge: an issued code (an app's, or
 * the one mailed) is confirmed, a recovery code is recovered. Either
 * answers like a sign-in.
 */
export function codeStep(
	input: { readonly kind: SecondFactorKind; readonly code: string },
	challenge: string,
	steps: Parameters<SignInFlow<string>['codeStep']>[2],
): Promise<SignInAnswer> {
	return input.kind === 'code'
		? steps.confirm(challenge, input.code)
		: steps.recover(challenge, input.code);
}
