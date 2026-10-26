import { data } from 'react-router';

/** Refuses a request from another site with a 403; reads headers only. */
export type SiteCheck = (request: Request) => void;

/**
 * The same-site rule of `readJson`: an `Origin` that is not the app's own, or
 * a `Sec-Fetch-Site` that is neither `same-origin` nor `none`, is a 403.
 * `origin` is the app's configured origin (or a getter), else the request's.
 */
export function siteCheck(
	origin?: string | (() => string | undefined) | undefined,
): SiteCheck {
	return (request) => {
		const set = typeof origin === 'function' ? origin() : origin;
		const own = set ?? new URL(request.url).origin;
		const from = request.headers.get('origin');
		const site = request.headers.get('sec-fetch-site');
		if (
			(from && from !== own) ||
			(site && site !== 'same-origin' && site !== 'none')
		) {
			throw data('Cross-site request refused', { status: 403 });
		}
	};
}

const checks = new WeakMap<object, SiteCheck>();

/** Remembers the check a `jsonActions` instance uses, for `/session`'s guard. Not public. */
export function rememberSiteCheck(actions: object, check: SiteCheck): void {
	checks.set(actions, check);
}

/**
 * Refuses a cross-site request with the rule of the `jsonActions` instance
 * (its configured origin); an instance of another make gets the request's own
 * origin. It reads headers only, never the body.
 */
export function refuseCrossSite(actions: object, request: Request): void {
	(checks.get(actions) ?? siteCheck())(request);
}
