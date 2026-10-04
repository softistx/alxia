/**
 * The path `app.use(path, ...middlewares)` is given, as it matches a
 * route's declared path, once, when the route is declared: no request
 * pays for it.
 *
 * - `/admin`: the route `/admin` and every route under it, segment by
 *   segment — not `/administrators`.
 * - `/admin/*`: every route under `/admin`, not `/admin` itself.
 * - `:name`: any one segment of the route's path, a literal, a parameter
 *   or its wildcard. A literal matches the same literal alone: `/users/me`
 *   is not `/users/:id`.
 *
 * The path is joined to the prefix of the app or group `use` is called on,
 * as a route's is, and checked as a route's is.
 */
import { compilePath } from '../router/compile';
import { joinPath } from '../router/paths';

/** Which routes a scoped middleware runs on, by their full declared paths. */
export interface ScopePath {
	/** The full pattern's segments, without its trailing `*`. */
	readonly segments: readonly string[];
	/** Whether it ends with `*`: the routes under it, not at it. */
	readonly under: boolean;
}

/** `pattern` under `prefix`, checked as a route path is; a bad one throws. */
export function scopePath(prefix: string, pattern: string): ScopePath {
	try {
		compilePath(pattern);
	} catch (error) {
		throw new TypeError(`use("${pattern}"): ${(error as Error).message}`);
	}
	if (pattern !== '/' && pattern.endsWith('/')) {
		// `/admin/` would match no route's segments, and guard nothing.
		throw new TypeError(
			`use("${pattern}"): a path given to use() does not end with "/"`,
		);
	}
	return parse(joinPath(prefix, pattern));
}

/** `path` under `prefix`: what an absorbed plugin's scoped middleware matches. */
export function rebase(path: ScopePath, prefix: string): ScopePath {
	if (prefix === '') return path;
	return parse(joinPath(prefix, `/${unparse(path)}`));
}

/** Whether a route declared at `route`, its full path, is in `path`. */
export function inScope(path: ScopePath, route: string): boolean {
	const segments = split(route);
	const { length } = path.segments;
	if (path.under ? segments.length <= length : segments.length < length) {
		return false;
	}
	return path.segments.every(
		(segment, index) => segment.startsWith(':') || segment === segments[index],
	);
}

function parse(full: string): ScopePath {
	const segments = split(full);
	const under = segments.at(-1) === '*';
	return { segments: under ? segments.slice(0, -1) : segments, under };
}

function unparse(path: ScopePath): string {
	return [...path.segments, ...(path.under ? ['*'] : [])].join('/');
}

/** A path's segments: `/` has none. */
function split(path: string): string[] {
	return path === '/' ? [] : path.split('/').slice(1);
}
