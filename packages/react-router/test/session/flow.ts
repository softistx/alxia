import { jsonActions } from '../../src/errors';
import {
	type SignInFlowOptions,
	sessionCookies,
	signInFlow,
} from '../../src/session';
import type { Lang } from '../errors/format';
import { plainErrors } from '../errors/refusal';

/** An hour from now: a session end no spec outlives. */
export const END = new Date(Date.now() + 60 * 60 * 1000);

/** A sign-in flow over development cookies, recording the tokens it revoked. */
export function flowFor(overrides: Partial<SignInFlowOptions<Lang>> = {}) {
	const revoked: string[] = [];
	const cookies = sessionCookies({
		session: 'my-app_session',
		challenge: 'my-app_challenge',
		secure: false,
	});
	const flow = signInFlow<Lang>({
		cookies,
		errors: plainErrors(),
		json: jsonActions(),
		revoke: async (token) => {
			revoked.push(token);
		},
		attemptsLeft: (count, language) => `${count} left (${language})`,
		...overrides,
	});
	return { flow, cookies, revoked };
}

/** A request, with the cookie a session of `token` would send. */
export function asking(url: string, token?: string, init: RequestInit = {}) {
	const { cookies } = flowFor();
	const cookie = token ? cookies.commit(token, END).split(';')[0] : undefined;
	return new Request(`http://my-app.test${url}`, {
		...init,
		headers: { ...(cookie && { cookie }), ...(init.headers as object) },
	});
}

export const setCookies = (response: Response) =>
	response.headers.getSetCookie();

/** The thrown value of a promise or a function. */
export async function thrown(run: () => unknown): Promise<unknown> {
	try {
		await run();
	} catch (error) {
		return error;
	}
	throw new Error('expected a throw');
}

/** What `data()` carries: its body and status. */
export const body = (result: unknown) =>
	result as { data: Record<string, unknown>; init: { status: number } };

/** A same-site JSON post, as a route action receives it. */
export const jsonPost = (url = '/account/step-up', body: unknown = {}) =>
	asking(url, undefined, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});

/** What each step-up step takes beside its `run`: a same-site JSON post, in English. */
export const stepCall = () => ({
	request: jsonPost(),
	language: 'en' as const,
});
