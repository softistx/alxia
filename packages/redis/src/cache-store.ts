import type { CachedResponse, CacheStore } from '@alxia/cache';
import { bindCache, defineCache } from '@nxgt/redis';
import { z } from 'zod';
import { nameUnder, type RedisTarget } from './handle';

export interface RedisCacheStoreOptions {
	/** Prepended to every key it writes: one name per app or deployment. Under a handle's prefix, when it is given one. */
	readonly name: string;
}

const Stored = z.object({
	status: z.number().int(),
	headers: z.array(z.tuple([z.string(), z.string()])),
	body: z.string(),
	storedAt: z.number(),
	ttl: z.number(),
	stale: z.number(),
	tags: z.array(z.string()),
});

/** What a Redis older than 7 answers to `EXPIRE … NX`. */
const REFUSED_ARGUMENTS = /wrong number of arguments|syntax error/i;

type Client = ReturnType<typeof nameUnder>['client'];

/**
 * Keeps a tag's set as long as its longest-kept response: `NX` gives a
 * new set its first expiry — `GT` alone never would, a key without one
 * counting as kept forever — and `GT` then only ever lengthens it. A
 * Redis older than 7 refuses both arguments: it gets the plain `EXPIRE`,
 * from then on. Any other error is the caller's.
 */
function tagKeeper(
	client: Client,
): (key: string, seconds: number) => Promise<void> {
	let flagsKnown = true;
	return async (key, seconds) => {
		const ttl = String(seconds);
		if (flagsKnown) {
			try {
				await client.send('EXPIRE', [key, ttl, 'NX']);
				await client.send('EXPIRE', [key, ttl, 'GT']);
				return;
			} catch (error) {
				if (!REFUSED_ARGUMENTS.test(String(error))) throw error;
				flagsKnown = false;
			}
		}
		await client.send('EXPIRE', [key, ttl]);
	};
}

/**
 * An `@alxia/cache` store in Redis, on `@nxgt/redis`'s typed caches: every
 * process sharing the Redis serves what one of them kept. A record that no
 * longer reads as a response is a miss, and is dropped. Tags are Redis sets
 * of the keys they name.
 *
 * ```ts
 * app.use(cache({ ttl: 60, store: redisCacheStore(connection.client, { name: 'shop' }) }));
 * ```
 *
 * Given an `@nxgt/redis` handle instead of a client, every key, the tag sets
 * included, is under the handle's `prefix`.
 */
export function redisCacheStore(
	target: RedisTarget,
	options: RedisCacheStoreOptions,
): CacheStore {
	const { client, name } = nameUnder(target, options.name);
	// `@nxgt/redis` keeps a record for whole seconds; the store's own `ttl`
	// and `stale` decide freshness to the millisecond.
	const records = bindCache(
		client,
		defineCache({
			name: `${name}:response`,
			key: (key: string) => key,
			ttl: 60,
			schema: Stored,
		}),
	);
	const tagKey = (tag: string) => `${name}:tag:${tag}`;
	const keepTag = tagKeeper(client);

	return {
		async get(key) {
			const record = await records.get(key);
			if (record === undefined) return undefined;
			const response: CachedResponse = {
				...record,
				body: new Uint8Array(Buffer.from(record.body, 'base64')),
			};
			return response;
		},
		async set(key, value, keepFor) {
			const seconds = Math.max(1, Math.ceil(keepFor / 1000));
			await records.set(
				key,
				{
					...value,
					headers: value.headers.map(
						([name, header]) => [name, header] as [string, string],
					),
					tags: [...value.tags],
					body: Buffer.from(value.body).toString('base64'),
				},
				{ ttl: seconds },
			);
			await Promise.all(
				value.tags.map(async (tag) => {
					await client.send('SADD', [tagKey(tag), records.keyFor(key)]);
					await keepTag(tagKey(tag), seconds);
				}),
			);
		},
		async delete(key) {
			await records.delete(key);
		},
		async deleteTag(tag) {
			const keys = (await client.send('SMEMBERS', [tagKey(tag)])) as string[];
			if (keys.length > 0) await client.send('DEL', keys);
			await client.send('DEL', [tagKey(tag)]);
		},
	};
}
