import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { rateLimit } from '@alxia/rate-limit';
import {
	bindRateLimit,
	defineIdempotency,
	defineRateLimit,
	defineRedis,
	openRedis,
} from '@nxgt/redis';
import { useRedis } from '../test/server';
import { idempotency } from './idempotency';
import { idempotencyResult } from './idempotency-response';
import { redisStore } from './store';

const db = useRedis();

const api = defineRateLimit({
	name: 'api',
	key: (ip: string) => ip,
	limit: 2,
	per: 60_000,
});
const byIp = defineRateLimit({
	name: 'by-ip',
	key: (p: { ip: string }) => p.ip,
	limit: 2,
	per: 60_000,
});
const orders = defineIdempotency({
	name: 'orders',
	key: (id: string) => id,
	ttl: 600,
	schema: idempotencyResult,
});
const other = defineIdempotency({
	name: 'other',
	key: (p: { id: string }) => p.id,
	ttl: 600,
	schema: idempotencyResult,
});

const open = () =>
	openRedis(
		defineRedis({
			uri: db.uri,
			prefix: 'shop',
			limits: { api, byIp },
			idempotency: { orders, other },
		}),
	);
const keys = async () =>
	((await db.client.send('KEYS', ['*'])) as string[]).sort();

const limited = (store: ReturnType<typeof redisStore>) =>
	alxia({ ip: () => '1.2.3.4' })
		.use(rateLimit({ limit: 2, windowMs: 60_000, store }))
		.get('/', ({ reply }) => reply(200, 'ok'));

describe('redisStore(handle.limits.api)', () => {
	test('counts under <prefix>:<name>:<key>, as @nxgt/redis does, and shares the count with it', async () => {
		const handle = await open();
		const app = limited(redisStore(handle.limits.api));
		expect((await app.request('/')).status).toBe(200);
		expect(await keys()).toEqual(['shop:api:1.2.3.4']);
		expect(handle.limits.api.keyFor('1.2.3.4')).toBe('shop:api:1.2.3.4');
		// Another consumer of the handle counts the same bucket.
		expect((await handle.limits.api.consume('1.2.3.4')).allowed).toBe(true);
		expect((await app.request('/')).status).toBe(429);
		expect(await keys()).toEqual(['shop:api:1.2.3.4']);
		await handle.close();
	});

	test('a wired limit and the same limit bound by hand count together', async () => {
		const handle = await open();
		const byHand = bindRateLimit(db.client, { ...api, name: 'shop:api' });
		await byHand.consume('1.2.3.4');
		const app = limited(redisStore(handle.limits.api));
		expect((await app.request('/')).status).toBe(200);
		expect((await app.request('/')).status).toBe(429);
		await handle.close();
	});

	test('a limit bound by hand is accepted too, with no prefix', async () => {
		const app = limited(redisStore(bindRateLimit(db.client, api)));
		await app.request('/');
		expect(await keys()).toEqual(['api:1.2.3.4']);
	});

	test('reset forgets the key', async () => {
		const handle = await open();
		const store = redisStore(handle.limits.api);
		const policy = { limit: 2, windowMs: 60_000 };
		await store.consume('k', policy);
		await store.consume('k', policy);
		expect((await store.consume('k', policy)).allowed).toBe(false);
		await store.reset('k');
		expect((await store.consume('k', policy)).allowed).toBe(true);
		await handle.close();
	});

	test('a client or handle without a name is refused, and a limit keyed by an object does not compile', async () => {
		const handle = await open();
		// @ts-expect-error a client needs its { name }
		expect(() => redisStore(db.client)).toThrow('needs { name }');
		// @ts-expect-error this limit counts by { ip }, and rateLimit by a string
		redisStore(handle.limits.byIp);
		await handle.close();
	});
});

describe('idempotency(handle.idempotency.orders)', () => {
	const ordered = (middleware: ReturnType<typeof idempotency>) => {
		let runs = 0;
		const app = alxia({ ip: () => '1.2.3.4' })
			.use(middleware)
			.post('/orders', ({ reply }) => reply(201, { run: ++runs }));
		const post = () =>
			app.request('/orders', {
				method: 'POST',
				headers: { 'idempotency-key': 'k-1' },
			});
		return { post, runs: () => runs };
	};

	test('keys are <prefix>:<name>:<route>:<scope>:<key>, the layout of the by-name form', async () => {
		const handle = await open();
		const wired = ordered(idempotency(handle.idempotency.orders));
		expect((await wired.post()).status).toBe(201);
		const key = 'shop:orders:/orders:1.2.3.4:k-1';
		expect(await keys()).toEqual([key]);
		expect(handle.idempotency.orders.keyFor('/orders:1.2.3.4:k-1')).toBe(key);

		// The by-name form on the same handle replays what the wired one stored.
		const byName = ordered(idempotency(handle, { name: 'orders' }));
		const again = await byName.post();
		expect(again.headers.get('idempotent-replayed')).toBe('true');
		expect(await again.json()).toEqual({ run: 1 });
		expect(byName.runs()).toBe(0);
		expect(await keys()).toEqual([key]);
		await handle.close();
	});

	test('the middleware options still apply: required', async () => {
		const handle = await open();
		const app = alxia({ ip: () => '1.2.3.4' })
			.use(idempotency(handle.idempotency.orders, { required: true }))
			.post('/orders', ({ reply }) => reply(201, 'ok'));
		const missing = await app.request('/orders', { method: 'POST' });
		expect(missing.status).toBe(400);
		expect(await missing.json()).toEqual({ error: 'idempotency_key_missing' });
		await handle.close();
	});

	test('name, ttl and lease are the definition, so the options refuse them', async () => {
		const handle = await open();
		// @ts-expect-error the name is the definition's
		expect(() => idempotency(handle.idempotency.orders, { name: 'x' })).toThrow(
			'"name" is the wired definition',
		);
		// @ts-expect-error so is the ttl
		expect(() => idempotency(handle.idempotency.orders, { ttl: 5 })).toThrow(
			'"ttl" is the wired definition',
		);
		// @ts-expect-error this one is keyed by an object
		idempotency(handle.idempotency.other);
		await handle.close();
	});

	test('an unscoped request warns under the definition name', async () => {
		const handle = await open();
		const original = console.warn;
		const warnings: unknown[] = [];
		console.warn = (message: unknown) => warnings.push(message);
		try {
			const app = alxia()
				.use(idempotency(handle.idempotency.orders))
				.post('/orders', ({ reply }) => reply(201, 'ok'));
			await app.request('/orders', {
				method: 'POST',
				headers: { 'idempotency-key': 'k' },
			});
		} finally {
			console.warn = original;
		}
		expect(String(warnings[0])).toStartWith('idempotency "shop:orders": ');
		await handle.close();
	});
});
