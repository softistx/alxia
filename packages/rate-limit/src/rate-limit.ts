import {
	type BaseContext,
	defineMiddleware,
	type Empty,
	type Middleware,
	markFactory,
	type Next,
	type Reply,
} from '@alxia/core';
import { ipv6Network } from './ipv6-network';
import { resolvePolicy } from './policy';
import {
	type Decision,
	MemoryStore,
	type Policy,
	type PolicyStore,
	type RateLimitStore,
} from './store';

/** What `RateLimitOptions` holds whatever the store: how a request is counted and answered. */
interface CountingOptions<Requires extends object> {
	/** What is counted: the client's address by default. `undefined` is not counted. */
	readonly key?: (
		ctx: BaseContext & Requires,
	) => string | undefined | Promise<string | undefined>;
	/** Requests not counted at all. */
	readonly skip?: (ctx: BaseContext & Requires) => boolean;
	/**
	 * Count an IPv6 client by its network: the first `ipv6Prefix` bits of
	 * `ctx.ip`, keyed as `2001:db8:1:2::/64`. One subscriber usually holds a
	 * whole /64, so per address it can dodge the limit; `64` is the value for
	 * the open Internet. A whole number from 0 to 128. IPv4 and IPv4-mapped
	 * addresses keep their own key. Off by default: each address is counted.
	 * It applies to the default key alone: given with a `key`, `rateLimit()`
	 * throws, since the option would silently do nothing.
	 */
	readonly ipv6Prefix?: number;
	/**
	 * The `RateLimit` headers of the IETF draft on every counted response,
	 * `X-RateLimit-*` with `legacy`, or none. `draft` by default.
	 */
	readonly headers?: 'draft' | 'legacy' | false;
}

/**
 * `Requires` is what `key` and `skip` read from the context beyond
 * `BaseContext` — a `user` an earlier middleware adds — and what the app that
 * uses the limit must then give.
 *
 * `limit` and `windowMs` are required, unless the `store` declares its own
 * `policy` (`@alxia/redis`'s `redisStore` of a wired limit): they are then
 * read from it, and one that is given must equal it.
 */
export type RateLimitOptions<Requires extends object = Empty> =
	CountingOptions<Requires> &
		(
			| {
					/** How many requests a key may make in a window: a whole number, 1 or more. */
					readonly limit: number;
					/** The window, in milliseconds: a whole number, 1 or more. */
					readonly windowMs: number;
					/** Where it is counted: one process's memory by default. */
					readonly store?: RateLimitStore;
			  }
			| {
					readonly limit?: number;
					readonly windowMs?: number;
					/** A store with a policy of its own gives `limit` and `windowMs`. */
					readonly store: PolicyStore;
			  }
		);

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
	checkPrefix(options);
	const store = options.store ?? new MemoryStore();
	const policy = resolvePolicy(options);
	const key = options.key ?? defaultKey<Requires>(options.ipv6Prefix);
	const style = options.headers ?? 'draft';
	return defineMiddleware<Requires>()(async function rateLimit(ctx, next) {
		const counted = options.skip?.(ctx) ? undefined : await key(ctx);
		if (counted === undefined) {
			const rateLimit: RateLimitInfo | undefined = undefined;
			return next({ rateLimit });
		}
		const decision = await store.consume(counted, policy);
		said(ctx.set.headers, style, policy, decision);
		if (!decision.allowed) {
			const retryAfter = Math.max(1, Math.ceil(decision.retryAfter / 1000));
			const body: RateLimitedBody = { error: 'rate_limited', retryAfter };
			return ctx.reply(429, body, {
				headers: { 'retry-after': String(retryAfter) },
			});
		}
		const rateLimit: RateLimitInfo | undefined = {
			limit: policy.limit,
			remaining: decision.remaining,
			resetAfter: decision.resetAfter,
		};
		return next({ rateLimit });
	});
}

/** The default key: `ctx.ip`, or its IPv6 network under `prefix` bits. */
function defaultKey<Requires extends object>(prefix: number | undefined) {
	return (ctx: BaseContext & Requires): string | undefined =>
		prefix === undefined || ctx.ip === undefined
			? ctx.ip
			: ipv6Network(ctx.ip, prefix);
}

/** `ipv6Prefix` is a whole number from 0 to 128, and goes with the default key. */
function checkPrefix(options: {
	readonly ipv6Prefix?: number | undefined;
	readonly key?: unknown;
}): void {
	const { ipv6Prefix } = options;
	if (ipv6Prefix === undefined) return;
	if (!Number.isInteger(ipv6Prefix) || ipv6Prefix < 0 || ipv6Prefix > 128) {
		throw new TypeError(
			`rateLimit: ipv6Prefix must be a whole number from 0 to 128, not ${String(ipv6Prefix)}`,
		);
	}
	if (options.key !== undefined) {
		throw new TypeError(
			'rateLimit: ipv6Prefix applies to the default key, and a key of your own was given. Drop one, or group the address in your key.',
		);
	}
}

/** The headers that say where the key stands, in the `style` asked for. */
function said(
	headers: Headers,
	style: 'draft' | 'legacy' | false,
	options: Policy,
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
