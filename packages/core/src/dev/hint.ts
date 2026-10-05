/**
 * The hint of a 404 or a 405 in dev: the declared route closest to the
 * request, by a distance on path segments, and the methods its path
 * allows when only the method was wrong. Chosen among the routes the
 * request could reach (`declaredOf`, `runtime.ts`): never one behind a
 * guard it has not passed.
 */
import { servedOf } from '../app/served';

/** Past this distance, no route is close enough to suggest. */
const FARTHEST = 1.5;
/** What a route of another method adds to the distance. */
const OTHER_METHOD = 0.5;

/**
 * The hint the router's answer carries in dev, or nothing: never outside
 * dev, nor on a 426.
 *
 * ```text
 * did you mean GET /todos/:id?
 * /todos/1 allows GET, DELETE
 * ```
 */
export function routingHint(
	ctx: { readonly request: Request },
	url: URL,
	status: number,
	allowed: readonly string[] | undefined,
): string | undefined {
	const served = servedOf(ctx);
	if (served?.dev !== true || served.declared === undefined) return undefined;
	if (status === 405 && allowed !== undefined) {
		return `${url.pathname} allows ${allowed.join(', ')}`;
	}
	if (status !== 404) return undefined;
	const closest = closestRoute(
		ctx.request.method,
		url.pathname,
		served.declared(),
	);
	return closest === undefined ? undefined : `did you mean ${closest}?`;
}

/** The declared `METHOD /path` closest to the request, if one is close enough. */
export function closestRoute(
	method: string,
	pathname: string,
	declared: Iterable<readonly [method: string, path: string]>,
): string | undefined {
	const asked = segmentsOf(pathname);
	let best: string | undefined;
	let least = FARTHEST;
	for (const [routeMethod, path] of declared) {
		const route = segmentsOf(path);
		// A route none of whose words is close to one asked is no suggestion.
		if (!sharesAWord(asked, route)) continue;
		const same =
			routeMethod === method ||
			routeMethod === 'ALL' ||
			(method === 'HEAD' && routeMethod === 'GET');
		const distance = segmentDistance(asked, route) + (same ? 0 : OTHER_METHOD);
		if (distance <= least) {
			// A tie goes to the route declared first.
			if (distance < least || best === undefined)
				best = `${routeMethod} ${path}`;
			least = distance;
		}
	}
	return best;
}

function segmentsOf(path: string): string[] {
	return path
		.toLowerCase()
		.split('/')
		.filter((segment) => segment !== '');
}

/**
 * The edit distance between a request's segments and a route's: a
 * parameter takes any segment, a wildcard the rest, a literal costs the
 * share of its letters a typo changed, and 1 past half of them; a segment
 * added or left out costs 1.
 */
export function segmentDistance(
	asked: readonly string[],
	route: readonly string[],
): number {
	let previous = Array.from({ length: route.length + 1 }, (_, j) => j);
	for (let i = 1; i <= asked.length; i++) {
		const current = [i];
		for (let j = 1; j <= route.length; j++) {
			const pattern = route[j - 1] as string;
			const cost = segmentCost(asked[i - 1] as string, pattern);
			current[j] = Math.min(
				(previous[j] as number) + (pattern === '*' ? 0 : 1),
				(current[j - 1] as number) + (pattern === '*' ? 0 : 1),
				(previous[j - 1] as number) + cost,
			);
		}
		previous = current;
	}
	return previous[route.length] as number;
}

/** Whether a literal segment of `route` is close to one of `asked`: a typo away at most. */
function sharesAWord(
	asked: readonly string[],
	route: readonly string[],
): boolean {
	return route.some(
		(pattern) =>
			isLiteral(pattern) &&
			asked.some((segment) => segmentCost(segment, pattern) < 1),
	);
}

function isLiteral(pattern: string): boolean {
	return !pattern.startsWith(':') && pattern !== '*';
}

/** 0 for a segment the pattern takes; a typo's share of the word; 1 for another word. */
function segmentCost(asked: string, pattern: string): number {
	if (!isLiteral(pattern) || pattern === asked) return 0;
	const share =
		letterDistance(asked, pattern) / Math.max(asked.length, pattern.length);
	return share <= 0.5 ? share : 1;
}

/** Levenshtein's distance between two words, letter by letter. */
function letterDistance(a: string, b: string): number {
	let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
	for (let i = 1; i <= a.length; i++) {
		const current = [i];
		for (let j = 1; j <= b.length; j++) {
			current[j] = Math.min(
				(previous[j] as number) + 1,
				(current[j - 1] as number) + 1,
				(previous[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1),
			);
		}
		previous = current;
	}
	return previous[b.length] as number;
}
