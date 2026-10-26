import {
	millisOf,
	readCookie,
	secondsUntil,
	serializeCookie,
} from './serialize';

export interface SessionCookiesOptions {
	/**
	 * The base name of the session cookie, e.g. `'my-app_session'`. With
	 * `secure`, the cookie is named `__Host-my-app_session`.
	 */
	readonly session: string;
	/**
	 * The base name of the second-factor challenge's cookie. With `secure`, it
	 * is named `__Secure-<name>`.
	 */
	readonly challenge: string;
	/**
	 * The app is served over HTTPS. Required, and never read from the
	 * environment: pass `!import.meta.env.DEV`. `false` drops `Secure` and the
	 * prefixes (Safari drops a `Secure` cookie over `http://localhost`).
	 */
	readonly secure: boolean;
	/** Where the browser sends the challenge. `'/sign-in'` by default. */
	readonly challengePath?: string;
	/** The most the challenge lives. 300, `@nxgt/janus`'s lifetime, by default. */
	readonly challengeSeconds?: number;
}

/** What the session cookie holds: the token, and the expiry (ms) it was last set to. */
export interface CookieSession {
	readonly token: string;
	readonly expiresAt: number;
}

export interface SessionCookies {
	/** The names as sent, prefixes included. */
	readonly names: { readonly session: string; readonly challenge: string };
	/** The session cookie of the request; `null` when absent or not `<ms>.<token>`. */
	read(request: Request): CookieSession | null;
	/** The session token of the request, or `null`. */
	token(request: Request): string | null;
	/** A `Set-Cookie` value keeping `token` until `expiresAt`. */
	commit(token: string, expiresAt: string | Date, now?: number): string;
	/** A `Set-Cookie` value removing the session cookie. */
	destroy(): string;
	/** The `Set-Cookie` header that keeps the cookie as long as the session lives; empty when the expiry did not move. */
	refreshed(
		session: CookieSession,
		expiresAt: string | Date | null,
	): HeadersInit;
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
	/**
	 * What a signed-out visit of the sign-in page sets: the challenge cleared
	 * blind (a client navigation fetches `/sign-in.data`, which the cookie's
	 * path does not match, so the request never shows it), and a dead
	 * session's cookie when `deadSession`.
	 */
	signInPageHeaders(deadSession: boolean): Headers;
}

// RFC 6265 `token`: what a cookie name may be made of.
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
const PREFIX = /^__(?:Host|Secure)-/;

function checkName(label: string, name: string): void {
	if (!TOKEN.test(name)) {
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

/** The cookies of a BFF's session and of its second-factor challenge. */
export function sessionCookies(options: SessionCookiesOptions): SessionCookies {
	const {
		secure,
		challengePath = '/sign-in',
		challengeSeconds = 5 * 60,
	} = options;
	checkName('session', options.session);
	checkName('challenge', options.challenge);
	if (!Number.isInteger(challengeSeconds) || challengeSeconds <= 0) {
		throw new TypeError(
			`sessionCookies(): challengeSeconds must be a positive integer; got ${String(challengeSeconds)}.`,
		);
	}
	if (!challengePath.startsWith('/')) {
		throw new TypeError(
			`sessionCookies(): challengePath must start with "/"; got ${JSON.stringify(challengePath)}.`,
		);
	}
	// `__Host-` holds only with `Path=/` and no `Domain`: the session cookie
	// sets neither option.
	const session = secure ? `__Host-${options.session}` : options.session;
	const challenge = secure
		? `__Secure-${options.challenge}`
		: options.challenge;
	const clear = (name: string, path?: string) =>
		serializeCookie(name, '', { maxAge: 0, secure, ...(path && { path }) });

	const read = (request: Request): CookieSession | null => {
		const value = readCookie(request, session);
		const dot = value?.indexOf('.') ?? -1;
		if (!value || dot < 1) return null;
		const expiresAt = Number(value.slice(0, dot));
		const token = value.slice(dot + 1);
		return token && Number.isSafeInteger(expiresAt)
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

	return {
		names: { session, challenge },
		read,
		token: (request) => read(request)?.token ?? null,
		commit,
		destroy: () => clear(session),
		refreshed(current, expiresAt) {
			if (!expiresAt || millisOf(expiresAt) === current.expiresAt) return {};
			return { 'Set-Cookie': commit(current.token, expiresAt) };
		},
		challengeOf: (request) => readCookie(request, challenge),
		commitChallenge: (value, expiresAt, now) =>
			serializeCookie(challenge, value, {
				maxAge: Math.min(
					challengeSeconds,
					expiresAt ? secondsUntil(expiresAt, now) : challengeSeconds,
				),
				path: challengePath,
				secure,
			}),
		destroyChallenge: () => clear(challenge, challengePath),
		signInPageHeaders(deadSession) {
			const headers = new Headers();
			headers.append('Set-Cookie', clear(challenge, challengePath));
			if (deadSession) headers.append('Set-Cookie', clear(session));
			return headers;
		},
	};
}
