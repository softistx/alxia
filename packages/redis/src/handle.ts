import type { BoundIdempotency, BoundRateLimit, Redis } from '@nxgt/redis';
import type { RedisClient } from 'bun';

/**
 * What the factories take: Bun's own client, or the handle `@nxgt/redis`'s
 * `openRedis(defineRedis({ … }))` gives back.
 */
export type RedisTarget = RedisClient | Redis<any>;

/** The one instance of a handle, resolved: its client and the prefix in front of its keys. */
export interface ResolvedTarget {
	readonly client: RedisClient;
	/** `undefined` when nothing goes in front of the keys, and always for a bare client. */
	readonly prefix: string | undefined;
}

/** A handle has `instances` and `close`; Bun's `RedisClient` has neither. */
export function isHandle(target: RedisTarget): target is Redis<any> {
	return (
		'instances' in target &&
		'close' in target &&
		typeof target.close === 'function'
	);
}

/**
 * The client and prefix of a target. A handle must wire exactly one Redis
 * instance: with several, which one an app's keys live on is for the app to
 * say, with the bare client of `handle.clients.<name>`.
 */
export function resolve(target: RedisTarget): ResolvedTarget {
	if (!isHandle(target)) return { client: target, prefix: undefined };
	const names = Object.keys(target.instances);
	const [only] = names;
	if (names.length !== 1 || only === undefined) {
		throw new TypeError(
			`@alxia/redis: this @nxgt/redis handle wires ${names.length} Redis instances (${names.map((name) => `"${name}"`).join(', ')}), and one is needed. Pass the client of one, as handle.clients.${names[0] ?? 'name'}, with its prefix in the name you give.`,
		);
	}
	const instance = target.instances[only as never] as {
		client: RedisClient;
		prefix: string | undefined;
	};
	return { client: instance.client, prefix: instance.prefix };
}

/** `name`, with the handle's prefix in front when there is one: the one name a deployment's keys share. */
export function nameUnder(
	target: RedisTarget,
	name: string,
): {
	readonly client: RedisClient;
	readonly name: string;
} {
	const { client, prefix } = resolve(target);
	return { client, name: prefix === undefined ? name : `${prefix}:${name}` };
}

/** A rate limit bound by `@nxgt/redis`, wired or by hand: `consume`, `peek`, `reset` and `keyFor`. */
export function isWiredLimit(value: object): value is BoundRateLimit<string> {
	const limit = value as Partial<BoundRateLimit<string>>;
	return (
		typeof limit.consume === 'function' &&
		typeof limit.peek === 'function' &&
		typeof limit.reset === 'function' &&
		typeof limit.keyFor === 'function'
	);
}

/** An idempotency bound by `@nxgt/redis`, wired or by hand: `run`, `forget` and `keyFor`. */
export function isWiredIdempotency(
	value: object,
): value is BoundIdempotency<string, any, any> {
	const bound = value as Partial<BoundIdempotency<string, unknown>>;
	return (
		typeof bound.run === 'function' &&
		typeof bound.forget === 'function' &&
		typeof bound.keyFor === 'function'
	);
}
