/**
 * `@alxia/react-router/session`: the session of a BFF, the app that renders
 * pages over a GraphQL API and keeps the API's session token in its own
 * cookie. Today it imports its own files alone; the subpath may import
 * `react-router` and `/errors`' files, nothing else.
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
