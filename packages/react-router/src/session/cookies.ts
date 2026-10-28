import {
	isCookieName,
	isCookiePath,
	millisOf,
	readCookie,
	secondsUntil,
	serializeCookie,
} from './serialize';

/** What every `sessionCookies` call takes, with or without a second factor. */
export interface SessionCookiesBaseOptions {
	/**
	 * The base name of the session cookie, e.g. `'my-app_session'`. With
	 * `secure`, the cookie is named `__Host-my-app_session`.
	 */
	readonly session: string;
	/**
	 * The app is served over HTTPS. Required, and never read from the
	 * environment: pass `!import.meta.env.DEV`. `false` drops `Secure` and the
	 * prefixes (Safari drops a `Secure` cookie over `http://localhost`).
	 */
	readonly secure: boolean;
}

/** The options of an app with no second factor: no challenge cookie. */
export interface SessionCookiesWithoutChallengeOptions
	extends SessionCookiesBaseOptions {
	readonly challenge?: undefined;
	readonly challengePath?: undefined;
	readonly challengeSeconds?: undefined;
}

/** The options of an app with a second factor: the challenge cookie's name is given. */
export interface SessionCookiesOptions extends SessionCookiesBaseOptions {
	/**
	 * The base name of the second-factor challenge's cookie. With `secure`, it
	 * is named `__Secure-<name>`.
	 */
	readonly challenge: string;
	/** Where the browser sends the challenge. `'/sign-in'` by default. */
	readonly challengePath?: string | undefined;
	/** The most the challenge lives. 300, `@nxgt/janus`'s lifetime, by default. */
	readonly challengeSeconds?: number | undefined;
}

/** What the session cookie holds: the token, and the expiry (ms) it was last set to. */
export interface CookieSession {
	readonly token: string;
	readonly expiresAt: number;
}

/** The cookies every BFF has: the session's. */
export interface SessionCookiesBase {
	/** The names as sent, prefixes included. */
	readonly names: { readonly session: string };
	/** The session cookie of the request; `null` when absent or not `<ms>.<token>`. */
	read(request: Request): CookieSession | null;
	/** The session token of the request, or `null`. */
	token(request: Request): string | null;
	/** A `Set-Cookie` value keeping `token` until `expiresAt`. */
	commit(token: string, expiresAt: string | Date, now?: number): string;
	/** A `Set-Cookie` value removing the session cookie. */
	destroy(): string;
	/** The `Set-Cookie` header that keeps the cookie as long as the session lives; empty when the expiry did not move, or is absent or not a date. */
	refreshed(
		session: CookieSession,
		expiresAt: string | Date | null,
	): HeadersInit;
	/**
	 * What a signed-out visit of the sign-in page sets: a dead session's
	 * cookie when `deadSession` (and, with a second factor, the challenge
	 * cleared blind: a client navigation fetches `/sign-in.data`, which the
	 * cookie's path does not match, so the request never shows it).
	 */
	signInPageHeaders(deadSession: boolean): Headers;
}

/** The challenge cookie's helpers, present when `challenge` was given. */
export interface ChallengeCookies {
	readonly names: { readonly challenge: string };
	/** The challenge cookie of the request, or `null`. */
	challengeOf(request: Request): string | null;
	/** A `Set-Cookie` value keeping the challenge for the code page. */
	commitChallenge(
		challenge: string,
		expiresAt?: string | Date | null,
		now?: number,
	): string;
	/** A `Set-Cookie` value removing the challenge. */
	destroyChallenge(): string;
}

/**
 * The cookies `sessionCookies` returns: with the challenge helpers (the
 * default) when `challenge` was given, `SessionCookies<false>` without.
 */
export type SessionCookies<WithChallenge extends boolean = true> =
	WithChallenge extends true
		? SessionCookiesBase & ChallengeCookies
		: SessionCookiesBase & NoChallengeCookies;

/**
 * What `SessionCookies<false>` says of the challenge helpers: they are
 * absent. Declared as `undefined` so that a set with a challenge is not
 * assignable to it (a flow with no second factor refuses one at compile time).
 */
export interface NoChallengeCookies {
	readonly challengeOf?: undefined;
	readonly commitChallenge?: undefined;
	readonly destroyChallenge?: undefined;
}

const PREFIX = /^__(?:Host|Secure)-/;

function checkName(label: string, name: string): void {
	if (!isCookieName(name)) {
		throw new TypeError(
			`sessionCookies(): the ${label} name ${JSON.stringify(name)} is not a cookie name (an RFC 6265 token: letters, digits and ! # $ % & ' * + - . ^ _ \` | ~). Pass a name such as "my-app_${label}".`,
		);
	}
	if (PREFIX.test(name)) {
		throw new TypeError(
			`sessionCookies(): the ${label} name ${JSON.stringify(name)} already carries a prefix. Pass the base name: the package adds __Host- (session) or __Secure- (challenge) when secure is true.`,
		);
	}
}

/**
 * The cookies of a BFF's session and, when `challenge` is given, of its
 * second-factor challenge. Without `challenge`, the result has no challenge
 * helpers and the type says so.
 *
 * @example
 * const cookies = sessionCookies({ session: 'my-app_session', secure: true });
 */
export function sessionCookies(
	options: SessionCookiesOptions,
): SessionCookies<true>;
export function sessionCookies(
	options: SessionCookiesWithoutChallengeOptions,
): SessionCookies<false>;
export function sessionCookies(
	options: SessionCookiesBaseOptions & {
		readonly challenge?: string | undefined;
		readonly challengePath?: string | undefined;
		readonly challengeSeconds?: number | undefined;
	},
): SessionCookies<boolean>;
export function sessionCookies(
	options: SessionCookiesBaseOptions & {
		readonly challenge?: string | undefined;
		readonly challengePath?: string | undefined;
		readonly challengeSeconds?: number | undefined;
	},
): SessionCookies<boolean> {
	const {
		secure,
		challengePath = '/sign-in',
		challengeSeconds = 5 * 60,
	} = options;
	checkName('session', options.session);
	if (options.challenge !== undefined)
		checkName('challenge', options.challenge);
	if (!Number.isInteger(challengeSeconds) || challengeSeconds <= 0) {
		throw new TypeError(
			`sessionCookies(): challengeSeconds must be a positive integer; got ${String(challengeSeconds)}.`,
		);
	}
	if (!isCookiePath(challengePath)) {
		throw new TypeError(
			`sessionCookies(): challengePath must start with "/" and hold no ";" or control character; got ${JSON.stringify(challengePath)}.`,
		);
	}
	// `__Host-` holds only with `Path=/` and no `Domain`: the session cookie
	// sets neither option.
	const session = secure ? `__Host-${options.session}` : options.session;
	const challengeName =
		options.challenge === undefined
			? undefined
			: secure
				? `__Secure-${options.challenge}`
				: options.challenge;
	const clear = (name: string, path?: string) =>
		serializeCookie(name, '', { maxAge: 0, secure, ...(path && { path }) });

	const read = (request: Request): CookieSession | null => {
		const value = readCookie(request, session);
		const dot = value?.indexOf('.') ?? -1;
		if (!value || dot < 1) return null;
		const digits = value.slice(0, dot);
		const expiresAt = Number(digits);
		const token = value.slice(dot + 1);
		return token && /^\d+$/.test(digits) && Number.isSafeInteger(expiresAt)
			? { token, expiresAt }
			: null;
	};
	// The value is `<expiry ms>.<token>`: the expiry only tells a later request
	// whether the API moved it, so the cookie is set again then. It is never
	// trusted: the API alone decides whether a session is valid.
	const commit = (token: string, expiresAt: string | Date, now?: number) =>
		serializeCookie(session, `${millisOf(expiresAt)}.${token}`, {
			maxAge: secondsUntil(expiresAt, now),
			secure,
		});

	const base: SessionCookiesBase = {
		names: { session },
		read,
		token: (request) => read(request)?.token ?? null,
		commit,
		destroy: () => clear(session),
		refreshed(current, expiresAt) {
			// An expiry that is not a date is garbage, not an end: keep the cookie.
			const end = expiresAt ? millisOf(expiresAt) : 0;
			if (!expiresAt || end === 0 || end === current.expiresAt) return {};
			return { 'Set-Cookie': commit(current.token, expiresAt) };
		},
		signInPageHeaders(deadSession) {
			const headers = new Headers();
			if (challengeName) {
				headers.append('Set-Cookie', clear(challengeName, challengePath));
			}
			if (deadSession) headers.append('Set-Cookie', clear(session));
			return headers;
		},
	};
	if (challengeName === undefined) return base;
	const challengeCookies: ChallengeCookies = {
		names: { challenge: challengeName },
		challengeOf: (request) => readCookie(request, challengeName),
		commitChallenge: (value, expiresAt, now) =>
			serializeCookie(challengeName, value, {
				maxAge: Math.min(
					challengeSeconds,
					expiresAt ? secondsUntil(expiresAt, now) : challengeSeconds,
				),
				path: challengePath,
				secure,
			}),
		destroyChallenge: () => clear(challengeName, challengePath),
	};
	return {
		...base,
		...challengeCookies,
		names: { session, challenge: challengeName },
	};
}

/** The `Set-Cookie` values that clear the challenge: none without a second factor. */
export function challengeCleared(cookies: SessionCookies<boolean>): string[] {
	return cookies.destroyChallenge ? [cookies.destroyChallenge()] : [];
}
