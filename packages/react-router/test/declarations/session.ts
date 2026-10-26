// The /session cookies behind exported values whose types are inferred: a
// declaration build must be able to name each one through
// `@alxia/react-router/session` alone (TS2883 otherwise).

import {
	type CookieSession,
	readCookie,
	secondsUntil,
	serializeCookie,
	sessionCookies,
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
