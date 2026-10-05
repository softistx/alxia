import type { Decision, Policy, RateLimitStore } from '@alxia/rate-limit';
import {
	type BoundRateLimit,
	bindRateLimit,
	defineRateLimit,
} from '@nxgt/redis';
import { nameUnder, type RedisTarget } from './handle';

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
): RateLimitStore {
	const { client, name } = nameUnder(target, options.name);
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
