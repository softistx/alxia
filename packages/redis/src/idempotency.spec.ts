import { beforeAll, describe, expect, test } from 'bun:test';
import { alxia, validate } from '@alxia/core';
import { z } from 'zod';
import { useRedis } from '../test/server';
import { idempotency } from './idempotency';

const db = useRedis();

let runs = 0;
const makeApp = () =>
	alxia({ ip: () => '1.2.3.4' })
		.post('/open', ({ reply }) => reply(201, ++runs))
		.use(idempotency(db.client, { name: 'payments' }))
		.post(
			'/payments',
			validate({ body: z.object({ amount: z.number() }) }),
			async ({ body, reply, set }) => {
				runs++;
				set.cookies.set('seen', 'yes');
				await Bun.sleep(40);
				return reply(201, { id: runs, amount: body.amount });
			},
		)
		.post('/fails', () => {
			throw new Error('down');
		});

describe('idempotency', () => {
	// Built once Redis is up: a plugin binds its client when it is made.
	let app: ReturnType<typeof makeApp>;
	beforeAll(() => {
		app = makeApp();
	});

	const pay = (key: string | undefined, amount = 10) =>
		app.request('/payments', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				...(key === undefined ? {} : { 'idempotency-key': key }),
			},
			body: JSON.stringify({ amount }),
		});

	test('a key runs once; a repeat replays the first response', async () => {
		runs = 0;
		const first = await pay('k-1');
		const again = await pay('k-1');
		expect(first.status).toBe(201);
		expect(await again.json()).toEqual({ id: 1, amount: 10 });
		expect(again.headers.get('idempotent-replayed')).toBe('true');
		expect(again.headers.get('set-cookie')).toBeNull();
		expect(runs).toBe(1);
		await pay(undefined);
		expect(runs).toBe(2);
	});

	test('a repeat while the first runs is a 409; another request with the key a 422', async () => {
		const [first, concurrent] = await Promise.all([pay('k-2'), pay('k-2')]);
		expect([first.status, concurrent.status].sort()).toEqual([201, 409]);
		const reused = await pay('k-2', 99);
		expect(reused.status).toBe(422);
		expect(await reused.json()).toEqual({ error: 'idempotency_key_reused' });
	});

	test('a request no route matches passes through, its key never taken', async () => {
		const missing = () =>
			app.request('/nowhere', {
				method: 'POST',
				headers: { 'idempotency-key': 'k-404' },
			});
		expect((await missing()).status).toBe(404);
		const again = await missing();
		expect(again.status).toBe(404);
		expect(again.headers.get('idempotent-replayed')).toBeNull();
	});

	test('a refusal is kept and replayed, as the route answered it', async () => {
		const refuse = () =>
			app.request('/payments', {
				method: 'POST',
				headers: {
					'content-type': 'application/json',
					'idempotency-key': 'k-400',
				},
				body: '{}',
			});
		expect((await refuse()).status).toBe(400);
		const again = await refuse();
		expect(again.status).toBe(400);
		expect(again.headers.get('idempotent-replayed')).toBe('true');
	});

	test('a 5xx is not kept: the key is free again', async () => {
		const original = console.error;
		console.error = () => {};
		try {
			const call = () =>
				app.request('/fails', {
					method: 'POST',
					headers: { 'idempotency-key': 'k-3' },
				});
			expect((await call()).status).toBe(500);
			expect((await call()).headers.get('idempotent-replayed')).toBeNull();
		} finally {
			console.error = original;
		}
	});
});
