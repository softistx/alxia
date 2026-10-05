import type { PingResult } from '@nxgt/redis';
import type { RedisTarget } from './handle';
import { isHandle } from './handle';

export interface RedisCheckOptions {
	/** Milliseconds a handle's ping waits for each instance. `@nxgt/redis`'s 2 s by default. */
	readonly timeoutMs?: number;
}

/**
 * A readiness check for core's `health({ checks })`: it passes when every
 * Redis instance of the handle answers a `PING`, and is down when one does
 * not, or when the call fails. Given a client, it sends the `PING` itself.
 *
 * ```ts
 * app.plugin(health({ checks: { redis: redisCheck(handle) } }));
 * ```
 */
export function redisCheck(
	target: RedisTarget,
	options: RedisCheckOptions = {},
): () => Promise<boolean> {
	return async () => {
		if (!isHandle(target)) {
			await target.send('PING', []);
			return true;
		}
		const results: Record<string, PingResult> = await target.ping(
			options.timeoutMs === undefined
				? undefined
				: { timeoutMs: options.timeoutMs },
		);
		return Object.values(results).every((result) => result.ok);
	};
}
