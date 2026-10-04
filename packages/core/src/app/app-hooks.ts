/**
 * The types of the global hooks an app declares for the whole app, wherever
 * they are declared: `onRequest`, `onResponse`, `around`, `onStart`,
 * `onStop` and `parser`. Each returns the app unchanged in type.
 */
import type { BodyParser } from '../request/read';
import type {
	AroundHook,
	RequestHook,
	ResponseHook,
	StartHook,
	StopHook,
} from './definition';

/** `app.onRequest(hook)`. */
export interface RequestHookMethod<App> {
	/**
	 * A global hook run on every request, before routing: a 404 included. A
	 * `Response` it returns is sent as it is, and no route's schemas check
	 * it: use it for what no operation of the API describes — a CORS
	 * preflight, a redirect to HTTPS. What a client must read belongs in a
	 * middleware, or in `derive`.
	 *
	 * @deprecated A middleware given to `use` first runs on every request
	 * too, a 404 included: `use(defineMiddleware((ctx, next) => early ??
	 * next()))`. See the upgrading guide.
	 */
	// biome-ignore lint/style/useShorthandFunctionType: a call signature carries its JSDoc to hover and signature help; a function type does not
	(hook: RequestHook): App;
}

/** `app.onResponse(hook)`. */
export interface ResponseHookMethod<App> {
	/**
	 * A global hook run on every response, in the order declared: headers,
	 * compression, logging. A `Response` it returns replaces the one sent;
	 * keep its status, which the API's document promises.
	 *
	 * @deprecated A middleware given to `use` first sees every response,
	 * a 404 included: `const response = await settle(ctx, next())`, then
	 * return it or another. See the upgrading guide.
	 */
	// biome-ignore lint/style/useShorthandFunctionType: a call signature carries its JSDoc to hover and signature help; a function type does not
	(hook: ResponseHook): App;
}

/** `app.around(hook)`. */
export interface AroundMethod<App> {
	/**
	 * A global hook around every request, the first declared outermost.
	 * `next()` runs everything else and resolves to the response; the hook
	 * returns it, or another. A socket's upgrade runs outside it: there is no
	 * response to wrap.
	 *
	 * ```ts
	 * app.around(async (ctx, next) => {
	 *   const started = performance.now();
	 *   const response = await next();
	 *   console.log(ctx.route, performance.now() - started);
	 *   return response;
	 * });
	 * ```
	 *
	 * @deprecated A middleware given to `use` first runs around every
	 * request, a 404 included, and what it awaits runs in its async
	 * context: `use(defineMiddleware((ctx, next) => storage.run(store, next)))`.
	 * See the upgrading guide.
	 */
	// biome-ignore lint/style/useShorthandFunctionType: a call signature carries its JSDoc to hover and signature help; a function type does not
	(hook: AroundHook): App;
}

/** `app.onStart(hook)`. */
export interface StartHookMethod<App> {
	/** Runs once `listen` has started the server. */
	// biome-ignore lint/style/useShorthandFunctionType: a call signature carries its JSDoc to hover and signature help; a function type does not
	(hook: StartHook): App;
}

/** `app.onStop(hook)`. */
export interface StopHookMethod<App> {
	/** Runs when `stop` stops the server: close a pool, flush a log. */
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
