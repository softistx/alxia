/**
 * The types of the lifecycle hooks an app declares for the whole app,
 * wherever they are declared — `onStart` and `onStop` — and of `parser`.
 * Each returns the app unchanged in type.
 */
import type { BodyParser } from '../request/read';
import type { StartHook, StopHook } from './definition';

/** `app.onStart(hook)`. */
export interface StartHookMethod<App> {
	/** Runs once `listen` has started the server. */
	// biome-ignore lint/style/useShorthandFunctionType: a call signature carries its JSDoc to hover and signature help; a function type does not
	(hook: StartHook): App;
}

/** `app.onStop(hook)`. */
export interface StopHookMethod<App> {
	/**
	 * Runs when `stop` stops the server: close a pool, flush a log. Given the
	 * server that stopped, the one `onStart` was given; `undefined` on a
	 * `stop()` before `listen`, which runs the hooks too.
	 */
	// biome-ignore lint/style/useShorthandFunctionType: a call signature carries its JSDoc to hover and signature help; a function type does not
	(hook: StopHook): App;
}

/** `app.parser(type, parse)`. */
export interface ParserMethod<App> {
	/**
	 * Reads a body of `type` — a `content-type` prefix, or a pattern — for
	 * every route with a `body` schema, before the built-in JSON, form and
	 * text parsers.
	 */
	// biome-ignore lint/style/useShorthandFunctionType: a call signature carries its JSDoc to hover and signature help; a function type does not
	(type: string | RegExp, parse: BodyParser['parse']): App;
}
