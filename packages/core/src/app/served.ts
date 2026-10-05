/**
 * What a request reads of the app that serves it, wherever its route was
 * declared — a plugin's included: the app's error format, and whether it
 * is shutting down. Kept on the request's context under a symbol shared
 * by every copy of core.
 */
import type { ErrorFormat } from '../errors/problems';
import { isAsyncIterable } from '../sse/async-iterable';

/** The serving app's state, as its requests read it. */
export interface Served {
	/** The `errors` option of the app that serves the request. */
	readonly errors: ErrorFormat;
	/** Aborted once the app starts shutting down; a new one each time it listens again. */
	closing: AbortController;
	/** Its `dev` switch: a hint on a 404 or a 405, an error page for a 500. */
	readonly dev?: boolean;
	/** In dev, every method and path it declares, a 404's hint chosen among them. */
	readonly declared?: () => Iterable<readonly [method: string, path: string]>;
}

/** Where a request's context keeps what it reads of the serving app. */
export const SERVED: unique symbol = Symbol.for('alxia.served');

/** A signal no shutdown ever aborts: a context no app serves. */
const NEVER = new AbortController().signal;

/** What a request's context reads of the app that serves it, if one does. */
export function servedOf(ctx: object): Served | undefined {
	return (ctx as { [SERVED]?: Served })[SERVED];
}

/**
 * The format the app answers its own errors in, for a middleware that
 * answers one itself: `json` by default, `problem` under
 * `alxia({ errors: 'problem' })`. Read from the app that serves the
 * request, so a plugin's middleware follows the app it is mounted on.
 *
 * ```ts
 * if (errorFormat(ctx) === 'problem') return problem(problemOf(ctx, { status: 403 }));
 * ```
 */
export function errorFormat(ctx: object): ErrorFormat {
	return servedOf(ctx)?.errors ?? 'json';
}

/**
 * Whether the app that serves the request is in dev — `alxia({ dev })`,
 * else `NODE_ENV=development` (`dev/mode.ts`): what a plugin reads to
 * help the developer there alone, as `graphql()`'s GraphiQL and
 * `health()`'s details do. `false` for a context no app serves.
 *
 * ```ts
 * if (isDev(ctx)) console.debug('cache miss', ctx.url.pathname);
 * ```
 */
export function isDev(ctx: object): boolean {
	return servedOf(ctx)?.dev === true;
}

/**
 * Aborted as soon as the app that serves the request starts shutting
 * down — on `SIGTERM`, `SIGINT` or `stop()`: what a long response, a
 * stream or a subscription, listens to, so it ends and the drain does not
 * wait for it. A stream of server-sent events a route replies with ends
 * on it by itself.
 *
 * ```ts
 * const closing = shutdownSignal(ctx);
 * closing.addEventListener('abort', () => subscription.end());
 * ```
 */
export function shutdownSignal(ctx: object): AbortSignal {
	return servedOf(ctx)?.closing.signal ?? NEVER;
}

/**
 * What ends a stream of events `body` is: its client leaving, or the
 * serving app shutting down. None for any other body, so a reply that
 * streams nothing pays for no signal.
 */
export function streamSignal(
	ctx: { readonly request: Request },
	body: unknown,
): AbortSignal | undefined {
	if (!isAsyncIterable(body)) return undefined;
	const served = servedOf(ctx);
	if (served === undefined) return ctx.request.signal;
	return AbortSignal.any([ctx.request.signal, served.closing.signal]);
}
