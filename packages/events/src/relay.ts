import { RedisError, withLock } from '@nxgt/redis';
import type { RedisClient } from 'bun';

export interface RelayOptions {
	/** The client the leader lock lives on. */
	redis: RedisClient;
	/** Wait between passes while events keep coming, ms. Default 1000. */
	interval?: number;
	/** The wait grows up to this while the outbox is idle, ms. Default 10 000. */
	maxInterval?: number;
	/** Key of the leader lock. Default `events:relay`. */
	lockKey?: string;
	/** How long the lock outlives a crashed leader, ms. Default 30 000. */
	lockTtl?: number;
	/** A pass that failed (a tenant's, or the lock's); the relay carries on. */
	onError?: (error: unknown) => void;
}

export interface Relay {
	/** One pass, if this process holds the leader lock. */
	tick(): Promise<{ leader: boolean; dispatched: number }>;
	/** Polls until `stop`. Idempotent. */
	start(): void;
	/** Stops polling and waits for the pass in flight. */
	stop(): Promise<void>;
}

/** The loop and the lock; what a pass does is `pass`. */
export function makeRelay(
	options: RelayOptions,
	pass: (onError: (error: unknown) => void) => Promise<number>,
): Relay {
	const interval = options.interval ?? 1_000;
	const maxInterval = Math.max(options.maxInterval ?? 10_000, interval);
	const lockKey = options.lockKey ?? 'events:relay';
	const lockTtl = options.lockTtl ?? 30_000;
	const onError = options.onError ?? (() => {});

	async function tick() {
		let dispatched = 0;
		try {
			await withLock(
				options.redis,
				lockKey,
				async () => {
					dispatched = await pass(onError);
				},
				{ ttl: lockTtl },
			);
		} catch (error) {
			if (error instanceof RedisError && error.code === 'LOCK_HELD') {
				return { leader: false, dispatched: 0 };
			}
			// The pass overran the lock: its jobs carry ids, so a second leader's
			// pass at worst adds the same jobs again.
			if (error instanceof RedisError && error.code === 'LOCK_LOST') {
				return { leader: true, dispatched };
			}
			throw error;
		}
		return { leader: true, dispatched };
	}

	let running: Promise<void> | undefined;
	let stopped = true;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let wake: (() => void) | undefined;

	async function loop() {
		let delay = interval;
		while (!stopped) {
			let dispatched = 0;
			try {
				dispatched = (await tick()).dispatched;
			} catch (error) {
				onError(error);
			}
			delay = dispatched > 0 ? interval : Math.min(delay * 2, maxInterval);
			if (stopped) break;
			await new Promise<void>((resolve) => {
				wake = resolve;
				timer = setTimeout(resolve, delay);
			});
		}
	}

	return {
		tick,
		start() {
			if (!stopped) return;
			stopped = false;
			running = loop();
		},
		async stop() {
			stopped = true;
			clearTimeout(timer);
			wake?.();
			await running;
			running = undefined;
		},
	};
}
