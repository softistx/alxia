import { alxia, markFactory } from '@alxia/core';
import {
	type BoundCache,
	bindCache,
	type CacheDefinition,
	type LockOptions,
	type Redis,
	type SoleInstance,
	withLock,
} from '@nxgt/redis';
import type { RedisClient } from 'bun';
import type { z } from 'zod';
import { isHandle, resolve } from './handle';

/**
 * Any `@nxgt/redis` cache definition, whatever its key parameters and
 * schema: what `redis()`'s `caches` hold. The constraint a function generic
 * over the caches it hands to `redis()` takes:
 *
 * ```ts
 * function withCaches<const Caches extends Record<string, AnyCache>>(caches: Caches) {
 *   return alxia().plugin(redis(client, { caches }));
 * }
 * ```
 */
export type AnyCache = CacheDefinition<any, z.ZodType>;

/** The caches of `Caches`, each bound to the client. */
export type BoundCaches<Caches extends Record<string, AnyCache>> = {
	readonly [Name in keyof Caches]: Caches[Name] extends CacheDefinition<
		infer Params,
		infer Schema
	>
		? BoundCache<Params, z.output<Schema>, z.input<Schema>>
		: never;
};

export interface RedisContextOptions<Caches extends Record<string, AnyCache>> {
	/** `@nxgt/redis` cache definitions, by the name routes read them under. */
	readonly caches?: Caches;
}

/** What routes after `redis()` read. */
export interface RedisContext<Caches extends Record<string, AnyCache>> {
	/** Bun's own client, untouched. */
	readonly redis: RedisClient;
	/** Each cache, bound and typed by its schema: `caches.users.remember(…)`. */
	readonly caches: BoundCaches<Caches>;
	/** `work` under a lock every process sharing the Redis respects: `@nxgt/redis`'s `withLock`. */
	lock<T>(
		key: string,
		work: () => Promise<T> | T,
		options?: LockOptions,
	): Promise<T>;
}

export interface RedisHandleOptions {
	/**
	 * Whether the handle is closed when the app stops: once, after the drain,
	 * in `onStop`. On by default; `false` when something else closes it.
	 */
	readonly close?: boolean;
}

/** What routes after `redis(handle)` read. */
export interface RedisHandleContext<C> {
	/** Bun's own client, untouched: the handle's one instance. */
	readonly redis: RedisClient;
	/** The handle's caches, typed by their schemas, the prefix already in front of every key. */
	readonly caches: SoleInstance<C>['cache'];
	/** `work` under a lock every process sharing the Redis respects, under the handle's prefix. */
	readonly lock: SoleInstance<C>['lock'];
	/** What goes in front of every key, or `undefined`. */
	readonly prefix: string | undefined;
}

function fromClient<
	const Caches extends Record<string, AnyCache> = Record<never, never>,
>(client: RedisClient, options: RedisContextOptions<Caches> = {}) {
	const caches = Object.fromEntries(
		Object.entries(options.caches ?? {}).map(([name, definition]) => [
			name,
			bindCache(client, definition),
		]),
	) as BoundCaches<Caches>;
	const context: RedisContext<Caches> = {
		redis: client,
		caches,
		lock: (key, work, lockOptions) => withLock(client, key, work, lockOptions),
	};
	return alxia().decorate(context);
}

function fromHandle<C>(handle: Redis<C>, options: RedisHandleOptions = {}) {
	const { client, prefix } = resolve(handle);
	const [name] = Object.keys(handle.instances);
	const instance = handle.instances[
		name as never
	] as unknown as SoleInstance<C>;
	const context: RedisHandleContext<C> = {
		redis: client,
		caches: instance.cache,
		lock: instance.lock,
		prefix,
	};
	let closing: Promise<void> | undefined;
	const app = alxia().decorate(context);
	return options.close === false
		? app
		: app.onStop(() => {
				closing ??= handle.close();
				return closing;
			});
}

/**
 * Redis in the context, as a plugin: the client, the caches bound once, and
 * a lock — typed, for every route declared after it.
 *
 * ```ts
 * const users = defineCache({ name: 'user', key: (id: string) => id, ttl: 300, schema: User });
 * app.plugin(redis(connection.client, { caches: { users } }))
 *    .get('/users/:id', async ({ caches, params, reply }) => reply.ok(await caches.users.remember(params.id, load)));
 * ```
 *
 * Given an `@nxgt/redis` handle, the caches are the handle's own, the
 * prefix is in front of every key and lock, and the handle is closed when
 * the app stops, after the drain (`{ close: false }` to close it yourself):
 *
 * ```ts
 * const handle = await openRedis(defineRedis({ uri, prefix: 'shop', caches }));
 * app.plugin(redis(handle)).get('/u/:id', ({ caches, params }) => caches.users.get(params.id));
 * ```
 */
export function redis<
	const Caches extends Record<string, AnyCache> = Record<never, never>,
>(
	client: RedisClient,
	options?: RedisContextOptions<Caches>,
): ReturnType<typeof fromClient<Caches>>;
export function redis<C>(
	handle: Redis<C>,
	options?: RedisHandleOptions,
): ReturnType<typeof fromHandle<C>>;
export function redis(
	target: RedisClient | Redis<never>,
	options?: RedisContextOptions<Record<string, AnyCache>> & RedisHandleOptions,
): unknown {
	return isHandle(target)
		? fromHandle(target, options)
		: fromClient(target, options);
}

markFactory(redis, 'plugin');
