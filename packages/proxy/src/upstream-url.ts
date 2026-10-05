/**
 * The URL a request is forwarded to: the target fixed at declaration, the
 * request's path under it, its query string. Nothing a request sends can
 * choose the host: the path is set on a copy of the target as a path, so
 * `//evil.example/x`, `/http://evil.example` or a `Host` header stay a
 * path or a header, and the result is checked against the target before
 * any fetch.
 */
import { HttpError } from '@alxia/core';
import type { Plan } from './options';

/** The body of the 400 a path that would leave the target's path gets. */
export interface OutsideTargetBody {
	readonly error: 'bad_request';
}

/**
 * Where `url`, as the app received it, goes upstream: `target` + the
 * rewritten path + the query. A 400 when the rewritten path climbs out of
 * the target's path (`..`, which only a `rewrite` function can introduce:
 * the request's own path is normalised before it reaches a middleware).
 */
export function upstreamUrl(plan: Plan, url: URL): URL {
	const rewritten = plan.rewrite(url.pathname);
	const path = rewritten.startsWith('/') ? rewritten : `/${rewritten}`;
	const upstream = new URL(plan.target.href);
	upstream.pathname = `${plan.base}${path}`;
	upstream.search = url.search;
	if (
		upstream.origin !== plan.target.origin ||
		!within(upstream.pathname, plan.base)
	) {
		throw new HttpError<400, OutsideTargetBody>(
			400,
			{ error: 'bad_request' },
			{
				message: `proxy: the path "${url.pathname}" rewrites outside the target's path "${plan.base || '/'}"`,
				detail: 'The request path leaves the upstream path',
			},
		);
	}
	return upstream;
}

function within(path: string, base: string): boolean {
	return base === '' || path === base || path.startsWith(`${base}/`);
}
