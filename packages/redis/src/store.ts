import type {
	Decision,
	Policy,
	PolicyStore,
	RateLimitStore,
} from '@alxia/rate-limit';
import {
	type BoundRateLimit,
	bindRateLimit,
	defineRateLimit,
	type RateLimitDefinition,
} from '@nxgt/redis';
import { isWiredLimit, nameUnder, type RedisTarget } from './handle';

export interface RedisStoreOptions {
	/**
	 * Prepended to every key it counts: one name per limit, so two never share
	 * a count. Under a handle's prefix, when it is given one.
	 */
	readonly name: string;
}

/**
 * An `@alxia/rate-limit` store in Redis, with `@nxgt/redis`'s GCRA:
 * every process sharing the Redis counts together, timed by the Redis
 * server's clock, and a refused request counts nothing.
 *
 * ```ts
 * app.use(rateLimit({ limit: 100, windowMs: 60_000, store: redisStore(redis.client, { name: 'api' }) }));
 * ```
 *
 * Given an `@nxgt/redis` handle instead of a client, every key is under the
 * handle's `prefix`: `redisStore(handle, { name: 'api' })` counts under
 * `<prefix>:api:…`.
 */
export function redisStore(
	target: RedisTarget,
	options: RedisStoreOptions,
): RateLimitStore;
/**
 * The store of a rate limit bound by `@nxgt/redis` (0.7 and later), wired by
 * `defineRedis` or by hand: the definition — its `limit`, `per` and `burst` —
 * is the one place. The store declares its `limit` and `per` as its `policy`,
 * so `rateLimit({ store })` takes `limit` and `windowMs` from it and the
 * numbers are written once. The keys are those `@nxgt/redis` writes,
 * `<prefix>:<name>:<key>`, so every consumer of the handle counts together,
 * alxia's routes included.
 *
 * ```ts
 * const api = defineRateLimit({ name: 'api', key: (ip: string) => ip, limit: 100, per: 60_000 });
 * const handle = await openRedis(defineRedis({ uri, prefix: 'shop', limits: { api } }));
 * app.use(rateLimit({ store: redisStore(handle.limits.api) }));
 * ```
 *
 * A `limit` or `windowMs` given to `rateLimit` too must equal the
 * definition's, or `rateLimit()` throws at declaration. The limit's key must
 * take a string, the one `rateLimit` counts by.
 */
export function redisStore(limit: BoundRateLimit<string>): PolicyStore;
/**
 * A bound rate limit with its definition beside it.
 *
 * @deprecated The bound limit carries its definition since `@nxgt/redis`
 * 0.7: `redisStore(handle.limits.api)` alone is the same store. Given both,
 * the definition's `limit` and `per` must equal the bound limit's, or this
 * throws.
 */
export function redisStore(
	limit: BoundRateLimit<string>,
	definition: RateLimitDefinition<string>,
): PolicyStore;
export function redisStore(
	target: RedisTarget | BoundRateLimit<string>,
	options?: RedisStoreOptions | RateLimitDefinition<string>,
): RateLimitStore {
	if (isWiredLimit(target)) {
		return policyStore(
			target,
			options as RateLimitDefinition<string> | undefined,
		);
	}
	if (options === undefined || !('name' in options)) {
		throw new TypeError(
			'redisStore: a client or a handle needs { name }; a wired rate limit, as handle.limits.api, is the only form without',
		);
	}
	const { client, name } = nameUnder(
		target,
		(options as RedisStoreOptions).name,
	);
	const limits = new Map<string, Promise<BoundRateLimit<string>>>();
	// Every policy counted under this name, by any process: what `reset` forgets.
	const policies = `${name}:policies`;
	const bind = (limit: number, windowMs: number) =>
		bindRateLimit(
			client,
			defineRateLimit({
				name: `${name}:${limit}/${windowMs}`,
				key: (key: string) => key,
				limit,
				per: windowMs,
			}),
		);
	/** The bound limit of a policy, recorded in `policies` the first time this process counts under it. */
	const limitFor = (policy: Policy) => {
		const id = `${policy.limit}/${policy.windowMs}`;
		let bound = limits.get(id);
		if (bound === undefined) {
			const limit = bind(policy.limit, policy.windowMs);
			const recorded = client.send('SADD', [policies, id]).then(() => limit);
			recorded.catch(() => {
				if (limits.get(id) === recorded) limits.delete(id);
			});
			limits.set(id, recorded);
			bound = recorded;
		}
		return bound;
	};
	return {
		async consume(key, policy): Promise<Decision> {
			const result = await (await limitFor(policy)).consume(key);
			return {
				allowed: result.allowed,
				remaining: result.remaining,
				resetAfter: result.resetAfter,
				retryAfter: result.retryAfter,
			};
		},
		async reset(key) {
			const ids = (await client.send('SMEMBERS', [policies])) as string[];
			await Promise.all(
				ids.map(async (id) => {
					// Only what `limitFor` writes: anything else in the set is not ours.
					const policy = /^(\d+)\/(\d+)$/.exec(id);
					if (policy === null) return;
					const limit = Number(policy[1]);
					const windowMs = Number(policy[2]);
					if (limit < 1 || windowMs < 1) return;
					await bind(limit, windowMs).reset(key);
				}),
			);
		},
	};
}

/** A wired limit as a store: it counts by its own rate, the policy the middleware holds is left to its headers. */
function wiredStore(limit: BoundRateLimit<string>): RateLimitStore {
	return {
		async consume(key): Promise<Decision> {
			const result = await limit.consume(key);
			return {
				allowed: result.allowed,
				remaining: result.remaining,
				resetAfter: result.resetAfter,
				retryAfter: result.retryAfter,
			};
		},
		async reset(key) {
			await limit.reset(key);
		},
	};
}

/**
 * A bound limit as a store, declaring the rate of its `definition` as its
 * policy. A definition given beside it must hold the same rate.
 */
function policyStore(
	limit: BoundRateLimit<string>,
	given?: RateLimitDefinition<string>,
): PolicyStore {
	const { limit: count, per } = limit.definition;
	if (given !== undefined && (given.limit !== count || given.per !== per)) {
		throw new TypeError(
			`redisStore: the definition "${given.name}" (${given.limit} per ${given.per}ms) is not the rate this limit counts by (${count} per ${per}ms)`,
		);
	}
	return { ...wiredStore(limit), policy: { limit: count, windowMs: per } };
}
