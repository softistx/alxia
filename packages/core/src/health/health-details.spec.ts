/**
 * What `/ready` tells whoever asks: each check's name, status and
 * duration in dev or under `details: true`, its status alone otherwise;
 * and a hung check is not started again while it still runs.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '../app/alxia';
import { health } from './health';

const checks = { db: () => true, redis: () => false };

describe('health({ details })', () => {
	test('by default, the checks are named in dev alone', async () => {
		const quiet = alxia({ dev: false }).plugin(health({ checks }));
		const response = await quiet.request('/ready');
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ status: 'down', checks: {} });
		const dev = alxia({ dev: true }).plugin(health({ checks }));
		const body = await (await dev.request('/ready')).json();
		expect(Object.keys(body.checks)).toEqual(['db', 'redis']);
	});

	test('true names them everywhere, false nowhere', async () => {
		const shown = alxia({ dev: false }).plugin(
			health({ checks, details: true }),
		);
		expect((await (await shown.request('/ready')).json()).checks.redis).toEqual(
			{
				status: 'down',
				duration: expect.any(Number),
				reason: 'failed',
			},
		);
		const hidden = alxia({ dev: true }).plugin(
			health({ checks, details: false }),
		);
		expect(await (await hidden.request('/ready')).json()).toEqual({
			status: 'down',
			checks: {},
		});
	});
});

describe('a hung check', () => {
	test('is not started again while its run is pending: the probes after the timeout join it', async () => {
		let started = 0;
		let settle = () => {};
		const hung = () => {
			started++;
			return new Promise<void>((resolve) => {
				settle = resolve;
			});
		};
		const app = alxia().plugin(
			health({ details: true, timeout: 20, cache: 0, checks: { hung } }),
		);
		for (let probe = 0; probe < 3; probe++) {
			const body = await (await app.request('/ready')).json();
			expect(body.checks.hung.reason).toBe('timeout');
		}
		expect(started).toBe(1);
		settle();
		await Bun.sleep(0);
		const after = await (await app.request('/ready')).json();
		expect(after.status).toBe('down');
		expect(started).toBe(2);
	});
});
