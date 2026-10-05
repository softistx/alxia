/**
 * What `proxy(target, options)` is given, and what it makes of it once, at
 * declaration: the target checked and fixed, the rewrite and the rebase
 * resolved, so that a request reads nothing but its own path.
 */
import type { RequestContext } from '@alxia/core';

/**
 * What a `headers` callback reads: the request as the app received it, its
 * address, and what the middlewares before the proxy added — `Ctx`, read
 * from the callback's annotated parameter.
 */
export type ProxyContext<Ctx = unknown> = RequestContext & Ctx;

/** One header's new value: a string sets it, `null` removes it, a function decides per request (`undefined` leaves it). */
export type HeaderValue<Ctx = unknown> =
	| string
	| null
	| ((ctx: ProxyContext<Ctx>) => string | null | undefined);

/**
 * How the proxy changes the headers on one side: header by header, or
 * through a function given them all, after the proxy's own changes.
 */
export type HeaderEdit<Ctx = unknown> =
	| Readonly<Record<string, HeaderValue<Ctx>>>
	| ((headers: Headers, ctx: ProxyContext<Ctx>) => void);

export interface ProxyHeaders<Ctx = unknown> {
	/** What the upstream receives, after the hop-by-hop headers are stripped and the forwarding ones set. */
	readonly request?: HeaderEdit<Ctx>;
	/** What the client receives, after the upstream's hop-by-hop headers are stripped and the response rebased. */
	readonly response?: HeaderEdit<Ctx>;
}

export interface ProxyOptions<Ctx = unknown> {
	/**
	 * The upstream path of a request: a prefix to strip (`'/api'`: `/api/users`
	 * goes to `/users`), or a function of the request's path. The query
	 * string is always kept. Whatever it returns is a path under the target,
	 * never another host.
	 */
	readonly rewrite?: string | ((path: string) => string);
	/**
	 * Rewrites the upstream's `Location` and its cookies' `Domain` and
	 * `Path` back to the public side: `true` puts them under the prefix
	 * `rewrite` strips, a string under that prefix. Off by default, on for
	 * `proxy.mount`.
	 */
	readonly rebase?: boolean | string;
	/** Sends the client's `Host` rather than the upstream's. */
	readonly preserveHost?: boolean;
	/** Appends to `X-Forwarded-For` and sets `X-Forwarded-Proto` and `-Host`. On by default. */
	readonly xForwarded?: boolean;
	/** Appends an RFC 7239 `Forwarded` element too. Off by default. */
	readonly forwarded?: boolean;
	/**
	 * Keeps the `X-Forwarded-Proto` and `-Host` the request arrived with,
	 * for an app that is itself behind a proxy it trusts. Off by default:
	 * they are set from the request as this app received it.
	 */
	readonly trustForwarded?: boolean;
	/** Headers to add, remove or transform, on each side. */
	readonly headers?: ProxyHeaders<Ctx>;
	/** Milliseconds the upstream has to send its response's headers: 30 000 by default; past it, a 504. */
	readonly timeout?: number;
	/** The most bytes a request body may hold, counted as it streams; past it, a 413. None by default. */
	readonly bodyLimit?: number;
}

/** The options, checked and resolved once. */
export interface Plan<Ctx = unknown> {
	readonly target: URL;
	/** The target's path, without its trailing `/`: what every upstream path starts with. */
	readonly base: string;
	readonly rewrite: (path: string) => string;
	/** The public prefix `Location` and cookies are rebased under, or none. */
	readonly rebase: string | undefined;
	readonly preserveHost: boolean;
	readonly xForwarded: boolean;
	readonly forwarded: boolean;
	readonly trustForwarded: boolean;
	readonly headers: ProxyHeaders<Ctx>;
	readonly timeout: number;
	readonly bodyLimit: number | undefined;
}

/** The default `timeout`, in milliseconds. */
export const TIMEOUT = 30_000;

/** Checks `target` and `options` once, where the proxy is declared. */
export function planOf<Ctx>(
	where: string,
	target: string | URL,
	options: ProxyOptions<Ctx>,
	schemes: readonly string[] = ['http:', 'https:'],
): Plan<Ctx> {
	const url = targetOf(where, target, schemes);
	const strip = options.rewrite;
	if (typeof strip === 'string') checkPrefix(where, 'rewrite', strip);
	if (typeof options.rebase === 'string') {
		checkPrefix(where, 'rebase', options.rebase);
	}
	const timeout = options.timeout ?? TIMEOUT;
	if (!(Number.isFinite(timeout) && timeout > 0)) {
		throw new TypeError(
			`${where}: timeout must be a number of milliseconds above 0; got ${String(timeout)}`,
		);
	}
	const limit = options.bodyLimit;
	if (limit !== undefined && !(Number.isSafeInteger(limit) && limit >= 0)) {
		throw new TypeError(
			`${where}: bodyLimit must be a whole number of bytes, 0 or more; got ${String(limit)}`,
		);
	}
	return {
		target: url,
		base: url.pathname.replace(/\/+$/, ''),
		rewrite: rewriterOf(strip),
		rebase: rebaseOf(options.rebase, strip),
		preserveHost: options.preserveHost === true,
		xForwarded: options.xForwarded !== false,
		forwarded: options.forwarded === true,
		trustForwarded: options.trustForwarded === true,
		headers: options.headers ?? {},
		timeout,
		bodyLimit: limit,
	};
}

/** The target as a URL: absolute, of an allowed scheme, with no query, fragment nor credentials. */
function targetOf(
	where: string,
	target: string | URL,
	schemes: readonly string[],
): URL {
	let url: URL;
	try {
		url = new URL(target);
	} catch {
		throw new TypeError(
			`${where}: the target must be an absolute URL, ${schemes.map((s) => `${s}//`).join(' or ')}; got "${String(target)}"`,
		);
	}
	if (!schemes.includes(url.protocol)) {
		throw new TypeError(
			`${where}: the target must be an absolute URL, ${schemes.map((s) => `${s}//`).join(' or ')}; got "${String(target)}"`,
		);
	}
	if (url.search !== '' || url.hash !== '' || url.username || url.password) {
		throw new TypeError(
			`${where}: the target "${String(target)}" carries a query, a fragment or credentials: give its origin and path alone, and credentials through headers`,
		);
	}
	return url;
}

function checkPrefix(where: string, option: string, prefix: string): void {
	if (!prefix.startsWith('/') || (prefix !== '/' && prefix.endsWith('/'))) {
		throw new TypeError(
			`${where}: ${option} must be a path that starts with "/" and does not end with one; got "${prefix}"`,
		);
	}
}

/** The rewrite as a function: a prefix stripped, compared without case as the router compares it. */
function rewriterOf(
	rewrite: ProxyOptions['rewrite'],
): (path: string) => string {
	if (typeof rewrite === 'function') return rewrite;
	if (rewrite === undefined || rewrite === '/') return (path) => path;
	const prefix = rewrite.toLowerCase();
	return (path) => {
		const lower = path.toLowerCase();
		if (lower === prefix) return '/';
		return lower.startsWith(`${prefix}/`) ? path.slice(prefix.length) : path;
	};
}

function rebaseOf(
	rebase: ProxyOptions['rebase'],
	rewrite: ProxyOptions['rewrite'],
): string | undefined {
	if (rebase === undefined || rebase === false) return undefined;
	if (typeof rebase === 'string') return rebase === '/' ? '' : rebase;
	return typeof rewrite === 'string' && rewrite !== '/' ? rewrite : '';
}
