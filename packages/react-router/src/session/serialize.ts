/**
 * The bytes of a cookie, and the reading of one: `Name=v; Max-Age=n; Path=/;
 * HttpOnly[; Secure]; SameSite=Lax`, in this order, so a session set by an
 * app before it adopted this package is still read after, and the other way
 * round.
 */

export interface SerializeOptions {
	/** Seconds; floored, and never below 0 (0 removes the cookie). */
	readonly maxAge: number;
	/** `/` by default. */
	readonly path?: string;
	/** Adds `Secure`. Required: it is never read from the environment. */
	readonly secure: boolean;
}

/** A `Set-Cookie` value: always `HttpOnly` and `SameSite=Lax`, `Secure` when asked. */
export function serializeCookie(
	name: string,
	value: string,
	{ maxAge, path = '/', secure }: SerializeOptions,
): string {
	return [
		`${name}=${encodeURIComponent(value)}`,
		`Max-Age=${Math.max(0, Math.floor(maxAge))}`,
		`Path=${path}`,
		'HttpOnly',
		...(secure ? ['Secure'] : []),
		'SameSite=Lax',
	].join('; ');
}

/**
 * A cookie of the request: the first one of that name that is not empty,
 * decoded; `null` when there is none, or when it is not valid percent-encoding.
 */
export function readCookie(request: Request, name: string): string | null {
	for (const pair of request.headers.get('cookie')?.split(';') ?? []) {
		const index = pair.indexOf('=');
		if (index < 0 || pair.slice(0, index).trim() !== name) continue;
		const raw = pair.slice(index + 1).trim();
		if (!raw) continue;
		try {
			return decodeURIComponent(raw);
		} catch {
			return null;
		}
	}
	return null;
}

/** An instant as milliseconds; 0 when it is not a date. */
export function millisOf(at: string | Date): number {
	const time = typeof at === 'string' ? Date.parse(at) : at.getTime();
	return Number.isNaN(time) ? 0 : time;
}

/** Seconds from `now` until `expiresAt`: 0 when past or unreadable. */
export function secondsUntil(
	expiresAt: string | Date,
	now: number = Date.now(),
): number {
	const end = millisOf(expiresAt);
	return end === 0 ? 0 : Math.max(0, (end - now) / 1000);
}
