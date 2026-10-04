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

/** A group's or a plugin's `prefix`, a valid one: the requests under it. */
export function prefixPath(prefix: string): ScopePath {
	return parse(prefix === '' ? '/' : prefix);
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
		} else if (!scoped.startsWith(':') && scoped !== segment.toLowerCase()) {
			return 'never';
		}
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
 * route matches checks of every one. The path is read as the router, the
 * static files and React Router read it, and fails closed: each segment
 * decoded (an encoded `/` splits it), empty segments collapsed (`//`, a
 * trailing `/`), compared without case. A segment that does not decode, or
 * a `.` or `..` left in it, runs the middleware. A path with neither `%`
 * nor `/.` — almost every request — is read in place, allocating nothing.
 */
export function matches(path: ScopePath, pathname: string): boolean {
	if (pathname.includes('%') || pathname.includes('/.')) {
		return matchesDecoded(path, pathname);
	}
	const length = pathname.length;
	let at = 0;
	for (const scoped of path.segments) {
		at = skipSlashes(pathname, at);
		if (at >= length) return false;
		let end = pathname.indexOf('/', at);
		if (end === -1) end = length;
		if (!scoped.startsWith(':') && !sameSegment(scoped, pathname, at, end)) {
			return false;
		}
		at = end;
	}
	return path.under ? skipSlashes(pathname, at) < length : true;
}

/** `matches`, for a path to decode first: a segment at a time. */
function matchesDecoded(path: ScopePath, pathname: string): boolean {
	const segments: string[] = [];
	for (const raw of pathname.split('/')) {
		let decoded: string;
		try {
			decoded = decodeURIComponent(raw);
		} catch {
			return true;
		}
		for (const part of decoded.split('/')) {
			if (part === '') continue;
			if (part === '.' || part === '..') return true;
			segments.push(part.toLowerCase());
		}
	}
	for (const [index, scoped] of path.segments.entries()) {
		const segment = segments[index];
		if (segment === undefined) return false;
		if (!scoped.startsWith(':') && segment !== scoped) return false;
	}
	return path.under ? segments.length > path.segments.length : true;
}

/** Where the next segment starts: past every `/` at `at`. */
function skipSlashes(pathname: string, at: number): number {
	let index = at;
	while (index < pathname.length && pathname.charCodeAt(index) === SLASH) {
		index += 1;
	}
	return index;
}

/** Whether `pathname` holds `scoped`, lower case, from `at` to `end`, in any case. */
function sameSegment(
	scoped: string,
	pathname: string,
	at: number,
	end: number,
): boolean {
	if (end - at !== scoped.length) return false;
	for (let index = 0; index < scoped.length; index++) {
		let code = pathname.charCodeAt(at + index);
		if (code >= UPPER_A && code <= UPPER_Z) code += LOWER;
		if (code !== scoped.charCodeAt(index)) return false;
	}
	return true;
}

const UPPER_A = 65;
const UPPER_Z = 90;
const LOWER = 32;
const SLASH = 47;

/** Its segments, those not a parameter in lower case: `matches` reads none in case. */
function parse(full: string): ScopePath {
	const segments = split(full).map((segment) =>
		segment.startsWith(':') ? segment : segment.toLowerCase(),
	);
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
