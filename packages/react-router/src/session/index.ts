/**
 * `@alxia/react-router/session`: the session of a BFF, the app that renders
 * pages over a GraphQL API and keeps the API's session token in its own
 * cookie. It imports `react-router` and `/errors` alone.
 */
export {
	type CookieSession,
	type SessionCookies,
	type SessionCookiesOptions,
	sessionCookies,
} from './cookies';
export {
	readCookie,
	type SerializeOptions,
	secondsUntil,
	serializeCookie,
} from './serialize';
