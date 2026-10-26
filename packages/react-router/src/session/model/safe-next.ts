/** Where a sign-in lands when `next` is missing or unsafe. */
export const HOME = '/';

/** The base a `next` is resolved against; `.invalid` never resolves. */
const BASE = 'http://next.invalid';

/**
 * The `next` a sign-in may redirect to: a path of this site only. Anything
 * that could leave it (`//host`, `/\host`, `https://…`, `javascript:…`, a
 * control character a browser would strip, a value over 2000 characters)
 * falls back to `/`. The path is read after normalisation, so `/a/..//host`
 * is refused too.
 *
 * @example
 * safeNext('/orders?page=2'); // '/orders?page=2'
 * safeNext('//evil.test'); // '/'
 */
export function safeNext(value: string | null | undefined): string {
	if (!value || value.length > 2000) return HOME;
	if (!value.startsWith('/') || value.startsWith('//')) return HOME;
	// Browsers read `\` as `/` and drop tabs and newlines in URLs.
	if (/[\\\p{Cc}\s]/u.test(value)) return HOME;
	try {
		const url = new URL(value, BASE);
		const path = `${url.pathname}${url.search}${url.hash}`;
		// Dot segments can collapse into `//host` again: check what is answered.
		if (url.origin !== BASE || path.startsWith('//')) return HOME;
		return path;
	} catch {
		return HOME;
	}
}
