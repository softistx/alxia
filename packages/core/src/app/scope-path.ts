/**
 * The path `app.use(path, ...middlewares)` is given, as it matches a
 * request's path: compiled once, when `use` is called, and decided once
 * per route when the route is declared — always, never, or by the request
 * when the route's parameters or wildcard reach the path.
 *
 * - `/admin`: `/admin` and every path under it, segment by segment —
 *   not `/administrators`.
 * - `/admin/*`: every path under `/admin`, not `/admin` itself.
 * - `:name`: any one segment.
 *
 * The path is joined to the prefix of the app or group `use` is called on,
 * as a route's is, and checked as a route's is.
 */
import { compilePath } from '../router/compile';
import { joinPath } from '../router/paths';

/** Which requests a scoped middleware runs on, by their paths. */
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

/**
 * Whether `path` runs on a route declared at `route`, its full path,
 * whatever the request: `always` when every request the route serves is
 * under it, `never` when none is, `maybe` when the route's parameters or
 * wildcard decide — then `matches` reads each request's path.
 */
export function reach(
	path: ScopePath,
	route: string,
): 'always' | 'never' | 'maybe' {
	if (!route.includes(':') && !route.includes('*')) {
		return matches(path, route) ? 'always' : 'never';
	}
	const segments = split(route);
	let uncertain = false;
	for (const [index, scoped] of path.segments.entries()) {
		const segment = segments[index];
		if (segment === undefined) return 'never';
		// A wildcard serves paths both under it and not.
		if (segment === '*') return 'maybe';
		if (segment.startsWith(':')) {
			if (!scoped.startsWith(':')) uncertain = true;
		} else if (!scoped.startsWith(':') && scoped !== segment) return 'never';
	}
	if (path.under) {
		const after = segments[path.segments.length];
		if (after === undefined) return 'never';
		if (after === '*') return 'maybe';
	}
	return uncertain ? 'maybe' : 'always';
}

/**
 * Whether a request's `pathname` is under `path`: what a scoped
 * middleware a route may or may not serve checks, and what a request no
 * route matches checks of every one. A trailing `/` is read as none, as
 * the router forgives it. Reads the string in place: no request pays an
 * allocation for it.
 */
export function matches(path: ScopePath, pathname: string): boolean {
	let length = pathname.length;
	if (length > 1 && pathname.charCodeAt(length - 1) === SLASH) length -= 1;
	// Where the next segment starts: "/" has none.
	let at = 1;
	for (const scoped of path.segments) {
		if (at >= length) return false;
		let end = pathname.indexOf('/', at);
		if (end === -1 || end > length) end = length;
		if (end === at) return false;
		if (
			!scoped.startsWith(':') &&
			(end - at !== scoped.length || !pathname.startsWith(scoped, at))
		) {
			return false;
		}
		at = end + 1;
	}
	return path.under ? at < length : true;
}

const SLASH = 47;

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
