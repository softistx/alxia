import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { useRedis } from '../test/server';
import { idempotency } from './idempotency';

const db = useRedis();

const post = (key: string) =>
	({
		method: 'POST',
		headers: { 'idempotency-key': key },
	}) satisfies RequestInit;

describe('app.plugin(idempotency()), deprecated', () => {
	test('a route declared after it is idempotent', async () => {
		let runs = 0;
		const app = alxia({ ip: () => '1.2.3.4' })
			.plugin(idempotency(db.client, { name: 'late' }))
			.post('/late', ({ reply }) => reply(201, ++runs));
		await app.request('/late', post('k-1'));
		const again = await app.request('/late', post('k-1'));
		expect(again.headers.get('idempotent-replayed')).toBe('true');
		expect(runs).toBe(1);
	});

	test('a route declared before it is idempotent too, as 0.3 hooks did', async () => {
		let runs = 0;
		const app = alxia({ ip: () => '1.2.3.4' })
			.post('/early', ({ reply }) => reply(201, ++runs))
			.plugin(idempotency(db.client, { name: 'early' }));
		await app.request('/early', post('k-1'));
		const again = await app.request('/early', post('k-1'));
		expect(again.headers.get('idempotent-replayed')).toBe('true');
		expect(runs).toBe(1);
	});
});
