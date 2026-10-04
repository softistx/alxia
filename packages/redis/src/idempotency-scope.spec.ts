import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { useRedis } from '../test/server';
import { type IdempotencyOptions, idempotency } from './idempotency';

const db = useRedis();

const WARNING =
	'idempotency "orders": no client scope could be derived (ctx.ip is undefined and no scope option returned one), so these requests run unguarded, nothing stored or replayed. Pass a scope option, (ctx) => a user id, or an ip option to alxia().';

describe('idempotency without a client scope', () => {
	let warnings: unknown[][] = [];
	const original = console.warn;
	beforeEach(() => {
		warnings = [];
		console.warn = (...args: unknown[]) => {
			warnings.push(args);
		};
	});
	afterEach(() => {
		console.warn = original;
	});

	const appOf = (ip?: string, scope?: IdempotencyOptions['scope']) => {
		let runs = 0;
		const app = alxia(ip === undefined ? {} : { ip: () => ip })
			.use(
				idempotency(db.client, {
					name: 'orders',
					...(scope === undefined ? {} : { scope }),
				}),
			)
			.post('/orders', ({ reply }) => reply(201, { run: ++runs }));
		const order = () =>
			app.request('/orders', {
				method: 'POST',
				headers: { 'idempotency-key': 'k-1' },
			});
		return { order, runs: () => runs };
	};

	test('no ip and no scope option: every request runs, none is replayed', async () => {
		const { order, runs } = appOf();
		const first = await order();
		const again = await order();
		expect(await first.json()).toEqual({ run: 1 });
		expect(await again.json()).toEqual({ run: 2 });
		expect(again.headers.get('idempotent-replayed')).toBeNull();
		expect(runs()).toBe(2);
		expect(await db.client.send('KEYS', ['*'])).toEqual([]);
	});

	test('it warns once per middleware, with what to do', async () => {
		const { order } = appOf();
		await order();
		await order();
		expect(warnings).toEqual([[WARNING]]);
		const other = appOf();
		await other.order();
		expect(warnings).toEqual([[WARNING], [WARNING]]);
	});

	test('a scope option that returns undefined runs it unguarded too', async () => {
		const { order, runs } = appOf('1.2.3.4', () => undefined);
		await order();
		const again = await order();
		expect(again.headers.get('idempotent-replayed')).toBeNull();
		expect(runs()).toBe(2);
		expect(warnings).toEqual([[WARNING]]);
	});

	test('with an ip, it guards, and warns nothing', async () => {
		const { order, runs } = appOf('1.2.3.4');
		await order();
		const again = await order();
		expect(again.headers.get('idempotent-replayed')).toBe('true');
		expect(runs()).toBe(1);
		expect(warnings).toEqual([]);
	});
});
