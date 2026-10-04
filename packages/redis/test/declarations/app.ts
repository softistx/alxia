// An app on Redis, behind exported functions whose return types are
// inferred: a declaration build must be able to name each one through
// `@alxia/redis`, `@alxia/core`, `@nxgt/redis` and `zod` alone (TS2883
// otherwise).
import { cache } from '@alxia/cache';
import { alxia } from '@alxia/core';
import { rateLimit } from '@alxia/rate-limit';
import {
	type AnyCache,
	idempotency,
	redis,
	redisCacheStore,
	redisStore,
} from '@alxia/redis';
import { defineCache } from '@nxgt/redis';
import { z } from 'zod';

// Bun's `RedisClient`, named through the plugin: the fixtures compile
// without Bun's types, as a consumer's declaration build may.
declare const client: Parameters<typeof redis>[0];

const users = defineCache({
	name: 'user',
	key: (id: string) => id,
	ttl: 300,
	schema: z.object({ id: z.string(), name: z.string() }),
});

export function withRedis() {
	return alxia()
		.plugin(redis(client, { caches: { users } }))
		.get('/users/:id', async ({ caches, lock, pathParams, reply }) => {
			const id = pathParams['id'] ?? '';
			const user = await lock(id, () =>
				caches.users.remember(id, async () => ({ id, name: 'Ada' })),
			);
			return reply(200, user);
		});
}

export function bare() {
	return alxia()
		.plugin(redis(client))
		.get('/', async ({ redis: connection, reply }) =>
			reply(200, await connection.get('k')),
		);
}

export function idempotent() {
	return alxia()
		.use(idempotency(client, { name: 'orders', required: true }))
		.post('/orders', ({ reply }) => reply(201, { id: 'o1' }));
}

export function stores() {
	return alxia()
		.use(
			rateLimit({
				limit: 100,
				windowMs: 60_000,
				store: redisStore(client, { name: 'api' }),
			}),
		)
		.use(cache({ ttl: 60, store: redisCacheStore(client, { name: 'shop' }) }))
		.get('/', ({ reply }) => reply(200, 'ok'));
}

// Generic over the caches, under the constraint `redis()` itself takes.
export function withCaches<const Caches extends Record<string, AnyCache>>(
	caches: Caches,
) {
	return alxia()
		.plugin(redis(client, { caches }))
		.get('/', ({ caches: bound, reply }) => reply(200, Object.keys(bound)));
}

export function guard() {
	return idempotency(client, { name: 'refunds', wait: 1_000 });
}
