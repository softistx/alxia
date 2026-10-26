import { safeNext } from './safe-next';

/**
 * A path of this site, or a `TypeError` naming `label`. With no `query`, the
 * path holds no `?` or `#` either, and the message prints it only up to
 * there, since what follows may be a token.
 */
export function sitePath(
	path: string,
	{
		label,
		query = false,
	}: { readonly label: string; readonly query?: boolean },
): string {
	if (safeNext(path) !== path || (!query && /[?#]/.test(path))) {
		const shown = query ? path : path.replace(/[?#].*$/s, '?…');
		throw new TypeError(
			`${label} must be a path of this site${query ? '' : ' with no query or fragment'}, starting with a single "/"; got ${JSON.stringify(shown)}.`,
		);
	}
	return path;
}
