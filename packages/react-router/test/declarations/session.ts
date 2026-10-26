// The /session cookies, the sign-in flow, the step-up and the links behind
// exported values whose types are inferred: a
// declaration build must be able to name each one through
// `@alxia/react-router/session` alone (TS2883 otherwise).

import {
	createApiErrors,
	createApiMessages,
	jsonActions,
} from '@alxia/react-router/errors';
import {
	authLinks,
	type CookieSession,
	readCookie,
	secondsUntil,
	serializeCookie,
	sessionCookies,
	signInFlow,
	stepUpSteps,
} from '@alxia/react-router/session';

export const cookies = sessionCookies({
	session: 'my-app_session',
	challenge: 'my-app_challenge',
	secure: true,
});
export const readSession = cookies.read;
export const header = serializeCookie('a', 'b', { maxAge: 1, secure: false });
export const named = readCookie;
export const left = secondsUntil;
export type Held = CookieSession;

const errors = createApiErrors<'en' | 'fr'>({
	messages: createApiMessages<'en' | 'fr'>({ format: (message) => message }),
	unavailable: (language) => language,
});
const json = jsonActions();

export const signIn = signInFlow({
	cookies,
	errors,
	json,
	revoke: async () => undefined,
	attemptsLeft: (count) => `${count}`,
});
export const stepUp = stepUpSteps({
	errors,
	json,
	attemptsLeft: (count) => `${count}`,
	spent: () => 'ask again',
});
export const links = authLinks({ signIn });
