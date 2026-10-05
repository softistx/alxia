import {
	type BaseContext,
	defineMiddleware,
	type Empty,
	type Middleware,
	markFactory,
	type Next,
	type Reply,
} from '@alxia/core';
import { type Decision, MemoryStore, type RateLimitStore } from './store';

/**
 * `Requires` is what `key` and `skip` read from the context beyond
 * `BaseContext` — a `user` an earlier middleware adds — and what the app that
 * uses the limit must then give.
 */
export interface RateLimitOptions<Requires extends object = Empty> {
	/** How many requests a key may make in a window: a whole number, 1 or more. */
	readonly limit: number;
	/** The window, in milliseconds: a whole number, 1 or more. */
	readonly windowMs: number;
	/** What is counted: the client's address by default. `undefined` is not counted. */
	readonly key?: (
		ctx: BaseContext & Requires,
	) => string | undefined | Promise<string | undefined>;
	/** Where it is counted: one process's memory by default. */
	readonly store?: RateLimitStore;
	/** Requests not counted at all. */
	readonly skip?: (ctx: BaseContext & Requires) => boolean;
	/**
	 * The `RateLimit` headers of the IETF draft on every counted response,
	 * `X-RateLimit-*` with `legacy`, or none. `draft` by default.
	 */
	readonly headers?: 'draft' | 'legacy' | false;
}

/** The body of the 429. */
export interface RateLimitedBody {
	readonly error: 'rate_limited';
	/** Seconds until the window ends. */
	readonly retryAfter: number;
}

/** What the routes behind the limit read: where the key stands. */
export interface RateLimitInfo {
	readonly limit: number;
	readonly remaining: number;
	/** Milliseconds until the allowance is whole again. */
	readonly resetAfter: number;
}

/**
 * What `rateLimit()` makes: a middleware that requires `Requires` of the
 * app, and gives `rateLimit` or answers the 429.
 */
export type RateLimit<Requires extends object = Empty> = Middleware<
	Requires,
	Promise<
		Reply<429, RateLimitedBody> | Next<{ rateLimit: RateLimitInfo | undefined }>
	>
>;

/**
 * A rate limit, as a middleware: every request it runs on is counted —
 * the routes declared after it, and, given to `app.use`, a request no
 * route matches too — and answered a 429 past the limit.
 *
 * ```ts
 * app.use(rateLimit({ limit: 100, windowMs: 60_000 })).get(...);
 * ```
 *
 * A `key` that reads what an earlier middleware added names it, and the
 * app must then give it: `rateLimit<{ user: User }>({ key: ({ user }) => user.id, … })`.
 */
export function rateLimit<Requires extends object = Empty>(
	options: RateLimitOptions<Requires>,
): NoInfer<RateLimit<Requires>> {
	for (const name of ['limit', 'windowMs'] as const) {
		const value = options[name];
		if (!Number.isSafeInteger(value) || value < 1) {
			// 0 refuses every request; a window of 0 or less never ends one.
			throw new TypeError(
				`rateLimit: ${name} must be a whole number of 1 or more, not ${String(value)}`,
			);
		}
	}
	const store = options.store ?? new MemoryStore();
	const key = options.key ?? ((ctx: BaseContext & Requires) => ctx.ip);
	const style = options.headers ?? 'draft';
	return defineMiddleware<Requires>()(async function rateLimit(ctx, next) {
		const counted = options.skip?.(ctx) ? undefined : await key(ctx);
		if (counted === undefined) {
			const rateLimit: RateLimitInfo | undefined = undefined;
			return next({ rateLimit });
		}
		const decision = await store.consume(counted, {
			limit: options.limit,
			windowMs: options.windowMs,
		});
		said(ctx.set.headers, style, options, decision);
		if (!decision.allowed) {
			const retryAfter = Math.max(1, Math.ceil(decision.retryAfter / 1000));
			const body: RateLimitedBody = { error: 'rate_limited', retryAfter };
			return ctx.reply(429, body, {
				headers: { 'retry-after': String(retryAfter) },
			});
		}
		const rateLimit: RateLimitInfo | undefined = {
			limit: options.limit,
			remaining: decision.remaining,
			resetAfter: decision.resetAfter,
		};
		return next({ rateLimit });
	});
}

/** The headers that say where the key stands, in the `style` asked for. */
function said(
	headers: Headers,
	style: 'draft' | 'legacy' | false,
	options: { readonly limit: number; readonly windowMs: number },
	decision: Decision,
): void {
	if (style === 'draft') {
		headers.set('ratelimit-limit', String(options.limit));
		headers.set('ratelimit-remaining', String(decision.remaining));
		headers.set(
			'ratelimit-reset',
			String(Math.ceil(decision.resetAfter / 1000)),
		);
		headers.set(
			'ratelimit-policy',
			`${options.limit};w=${Math.ceil(options.windowMs / 1000)}`,
		);
	} else if (style === 'legacy') {
		headers.set('x-ratelimit-limit', String(options.limit));
		headers.set('x-ratelimit-remaining', String(decision.remaining));
		headers.set(
			'x-ratelimit-reset',
			String(Math.ceil((Date.now() + decision.resetAfter) / 1000)),
		);
	}
}

markFactory(rateLimit);
