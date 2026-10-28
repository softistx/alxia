import { data } from 'react-router';
import { isCrossSite } from './cross-site';

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
		if (isCrossSite(request, set)) {
			throw data('Cross-site request refused', { status: 403 });
		}
	};
}

/**
 * Where a `jsonActions` instance keeps its site check: an enumerable property
 * under a registered symbol, so it survives `{ ...json }` and a second copy of
 * the package. Not public.
 */
export const SITE_CHECK = Symbol.for('@alxia/react-router:site-check@1');

/** Puts the check on a `jsonActions` instance. */
export function rememberSiteCheck(actions: object, check: SiteCheck): void {
	Object.defineProperty(actions, SITE_CHECK, {
		value: check,
		enumerable: true,
		writable: false,
	});
}

/** Whether `actions` carries a site check, as every `jsonActions()` instance does. */
export const hasSiteCheck = (actions: object): boolean =>
	typeof (actions as Record<symbol, unknown>)[SITE_CHECK] === 'function';

/**
 * Refuses a cross-site request with the rule of the `jsonActions` instance
 * (its configured origin, read at each request); an object without a check
 * gets the request's own origin. It reads headers only, never the body.
 */
export function refuseCrossSite(actions: object, request: Request): void {
	const check = (actions as Record<symbol, unknown>)[SITE_CHECK];
	(typeof check === 'function' ? (check as SiteCheck) : siteCheck())(request);
}
