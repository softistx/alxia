/**
 * `health()`: liveness while the process is up; readiness from the
 * checks, each timed out, its report cached and shared, and a 503 from
 * the moment the app starts shutting down.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '../app/alxia';
import { health, isHealthRoute } from './health';

describe('health()', () => {
	test('GET /health answers 200 while the process is up, and is never cached', async () => {
		const app = alxia().plugin(health());
		const response = await app.request('/health');
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(await response.json()).toEqual({ status: 'ok' });
		expect((await app.request('/health', { method: 'HEAD' })).status).toBe(200);
	});

	test('GET /ready answers 200 with each check, its status and its duration', async () => {
		const app = alxia().plugin(
			health({ checks: { redis: () => 'PONG', db: async () => [{ one: 1 }] } }),
		);
		const response = await app.request('/ready');
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body.status).toBe('ok');
		expect(body.checks.redis).toEqual({
			status: 'ok',
			duration: expect.any(Number),
		});
		expect(body.checks.db.status).toBe('ok');
	});

	test('a check that throws, rejects, returns false or is late makes it a 503', async () => {
		const app = alxia().plugin(
			health({
				timeout: 50,
				checks: {
					ok: () => true,
					throws: () => {
						throw new Error('ECONNREFUSED 10.0.0.3:5432');
					},
					rejects: () => Promise.reject(new Error('down')),
					no: () => false,
					late: () => Bun.sleep(500),
				},
			}),
		);
		const response = await app.request('/ready');
		expect(response.status).toBe(503);
		const body = await response.json();
		expect(body.status).toBe('down');
		expect(body.checks.ok.status).toBe('ok');
		for (const name of ['throws', 'rejects', 'no']) {
			expect(body.checks[name]).toMatchObject({
				status: 'down',
				reason: 'failed',
			});
		}
		expect(body.checks.late).toMatchObject({
			status: 'down',
			reason: 'timeout',
		});
		expect(body.checks.late.duration).toBeLessThan(400);
		expect(JSON.stringify(body)).not.toContain('10.0.0.3');
	});
});

describe('health(): the cache and the shutdown', () => {
	test('the report is cached for `cache` ms, and shared by the probes meanwhile', async () => {
		let runs = 0;
		const app = alxia().plugin(
			health({
				cache: 100,
				checks: {
					db: async () => {
						runs++;
						await Bun.sleep(20);
					},
				},
			}),
		);
		await Promise.all([app.request('/ready'), app.request('/ready')]);
		await app.request('/ready');
		expect(runs).toBe(1);
		await Bun.sleep(150);
		await app.request('/ready');
		expect(runs).toBe(2);
	});

	test('readiness answers 503 as soon as the shutdown starts, liveness 200', async () => {
		let checked = 0;
		const app = alxia()
			.plugin(health({ checks: { db: () => checked++ } }))
			.get('/slow', async ({ reply }) => {
				await Bun.sleep(200);
				return reply(200);
			});
		const server = app.listen({ port: 0, signals: false });
		const slow = fetch(`${server.url.href}slow`);
		await Bun.sleep(20);
		const stopped = app.stop();
		const ready = await app.request('/ready');
		expect(ready.status).toBe(503);
		expect(await ready.json()).toEqual({ status: 'shutting_down', checks: {} });
		expect(checked).toBe(0);
		expect((await app.request('/health')).status).toBe(200);
		await slow;
		await stopped;
	});

	test('the paths are options, and isHealthRoute tells the probes apart', () => {
		const app = alxia()
			.plugin(health({ path: '/livez', readyPath: '/readyz' }))
			.get('/users', ({ reply }) => reply(200));
		expect(
			app.routes.map((route) => [route.path, isHealthRoute(route)]),
		).toEqual([
			['/livez', true],
			['/readyz', true],
			['/users', false],
		]);
	});

	test('a timeout or a cache that is not a number of milliseconds throws', () => {
		expect(() => health({ timeout: -1 })).toThrow(
			'health(): timeout must be a number of milliseconds, 0 or more; got -1',
		);
		expect(() => health({ cache: Number.NaN })).toThrow(
			'health(): cache must be a number of milliseconds, 0 or more; got NaN',
		);
	});
});
