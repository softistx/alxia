/**
 * `pageHeaders`: the headers of a server-rendered page that carries a
 * nonce, as one preset over `secureHeaders`.
 */
import { markFactory } from '@alxia/core';
import { type CspDirectives, csp } from './csp';
import { NONCE } from './nonce';
import {
	type NonceMiddleware,
	type SecureHeadersOptions,
	secureHeaders,
} from './secure-headers';

/**
 * A strict policy for server-rendered pages with a nonce, one entry per
 * directive, each with why it holds what it holds. A new source goes in the
 * directive that loads it (through `pageHeaders`' `directives`), never in
 * `default-src`, and never `'unsafe-inline'` or `'unsafe-eval'` in `script-src`.
 */
export const PAGE_DIRECTIVES: CspDirectives = {
	// Anything a directive below does not name: this site only.
	'default-src': ["'self'"],
	// Only the scripts this response's nonce marks (the framework's inline
	// ones and its entry module), and whatever they load ('strict-dynamic':
	// the route chunks they import). 'self' is a fallback for browsers
	// without 'strict-dynamic'; they ignore it when a nonce is present.
	'script-src': ["'self'", NONCE, "'strict-dynamic'"],
	// <style> elements: this site's stylesheets and the ones that carry this
	// response's nonce (a UI library's nonced style elements, a dev client's).
	// No 'unsafe-inline' here: an injected <style> is the CSS attack
	// (attribute selectors reading a value out).
	'style-src-elem': ["'self'", NONCE],
	// `style` attributes (custom properties, positions, a UI library's and
	// React's own): no nonce covers an attribute, 'unsafe-inline' is the only
	// way. It allows no <style> element and no script.
	'style-src-attr': ["'unsafe-inline'"],
	// The icons, sprites and logo. No data: or blob: until a feature needs one.
	'img-src': ["'self'"],
	// Self-hosted fonts.
	'font-src': ["'self'"],
	// The framework's data requests, only to this site. In development, the
	// dev server's WebSocket too: 'self' covers ws: on the page's own host.
	'connect-src': ["'self'"],
	// The service worker, served by this site.
	'worker-src': ["'self'"],
	// The web app manifest, a route of this site.
	'manifest-src': ["'self'"],
	// No plugin content.
	'object-src': ["'none'"],
	// No `<base>`: a relative URL always means this site.
	'base-uri': ["'none'"],
	// Forms post to this site only (a submit before hydration included).
	'form-action': ["'self'"],
	// No page frames this one (clickjacking); X-Frame-Options covers older
	// browsers.
	'frame-ancestors': ["'none'"],
};

export interface PageHeadersOptions
	extends Omit<SecureHeadersOptions, 'contentSecurityPolicy'> {
	/**
	 * Served over HTTPS: sends HSTS and adds `upgrade-insecure-requests`.
	 * Required, and never read from the environment: `import.meta.env.PROD`
	 * or your own flag.
	 */
	readonly https: boolean;
	/**
	 * Merged over `PAGE_DIRECTIVES`: a list replaces the preset's, `false`
	 * removes a directive. An `upgrade-insecure-requests` given here wins
	 * over `https`.
	 */
	readonly directives?: CspDirectives;
}

/**
 * `secureHeaders({ nonce: true, … })` for server-rendered pages: the
 * `PAGE_DIRECTIVES` policy with a nonce per request, HSTS and
 * `upgrade-insecure-requests` only with `https`, `Referrer-Policy:
 * strict-origin-when-cross-origin`, and `Cache-Control: private, no-store`
 * (a cache must never store a nonce). Any other option passes through to
 * `secureHeaders`, and wins over the preset's.
 *
 * ```ts
 * app.use(pageHeaders({ https: import.meta.env.PROD }));
 * ```
 *
 * Throws a `TypeError` when the merged `script-src` lacks `NONCE`: the page
 * would not hydrate.
 */
export function pageHeaders(options: PageHeadersOptions): NonceMiddleware {
	const { https, directives = {}, ...rest } = options;
	const merged: CspDirectives = {
		...PAGE_DIRECTIVES,
		...directives,
		'upgrade-insecure-requests':
			directives['upgrade-insecure-requests'] ?? https,
	};
	const scripts = merged['script-src'];
	if (!Array.isArray(scripts) || !scripts.includes(NONCE)) {
		throw new TypeError(
			"pageHeaders(): script-src has no NONCE: a page script runs only with the response's nonce, so write script-src with NONCE in directives, such as [\"'self'\", NONCE, \"'strict-dynamic'\"]",
		);
	}
	return secureHeaders({
		strictTransportSecurity: https
			? 'max-age=31536000; includeSubDomains'
			: false,
		referrerPolicy: 'strict-origin-when-cross-origin',
		cacheControl: 'private, no-store',
		...rest,
		nonce: true,
		contentSecurityPolicy: csp(merged),
	});
}

markFactory(pageHeaders);
