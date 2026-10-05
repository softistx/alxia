/**
 * The types of how an app is called once declared: `request`, in process;
 * `listen`, on a server of its own.
 */
import type { ListenOptions } from './signatures';

/** `app.request(path, init?)`. */
export interface RequestMethod {
	/** A request to the app, in process: `app.request('/users/1')`. */
	// biome-ignore lint/style/useShorthandFunctionType: a call signature carries its JSDoc to hover and signature help; a function type does not
	(path: string, init?: RequestInit): Promise<Response>;
}

/** `app.listen(options?)`. */
export interface ListenMethod {
	/**
	 * `Bun.serve` with this app: its paths go to Bun's own router, and what
	 * none of them matches to `fetch`, which answers 404 or 405.
	 *
	 * Bun matches the request's target as it came, `/f/../a` and all, where
	 * `fetch` reads its URL's pathname, `/a`. A path without parameters is
	 * matched by Bun only by a target already in that form, so its route
	 * answers; a request Bun gives to a path with parameters or a wildcard
	 * is routed again as `fetch` routes it, so both choose alike, at the
	 * cost of `fetch`'s routing on each such request.
	 *
	 * One server at a time: `listen` on an app that listens throws, until
	 * `stop()`, or a signal, shuts it down.
	 */
	// biome-ignore lint/style/useShorthandFunctionType: a call signature carries its JSDoc to hover and signature help; a function type does not
	(options?: ListenOptions | number): Bun.Server<unknown>;
}
