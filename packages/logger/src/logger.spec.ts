import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { type LogEntry, logger } from './logger';

describe('logger', () => {
	const entries: LogEntry[] = [];
	const app = alxia()
		.use(
			logger({
				write: (entry) => entries.push(entry),
				skip: (_, url) => url.pathname === '/health',
			}),
		)
		.get('/hello', ({ requestId, log, reply }) => {
			log.info('greeting', { who: 'ada' });
			return reply(200, requestId);
		})
		.get('/health', ({ reply }) => reply(200));

	test('an id per request, sent back, logged with each entry', async () => {
		entries.length = 0;
		const response = await app.request('/hello');
		const id = await response.text();
		expect(response.headers.get('x-request-id')).toBe(id);
		expect(response.headers.get('server-timing')).toStartWith('total;dur=');
		expect(entries.map((entry) => entry.message)).toEqual([
			'greeting',
			'GET /hello 200',
		]);
		expect(entries.every((entry) => entry.requestId === id)).toBe(true);
		expect(entries[0]?.['who']).toBe('ada');
	});

	test('an incoming id is kept, unless it is not one', async () => {
		const kept = await app.request('/hello', {
			headers: { 'x-request-id': 'abc-123' },
		});
		expect(await kept.text()).toBe('abc-123');
		const refused = await app.request('/hello', {
			headers: { 'x-request-id': 'a b\n' },
		});
		expect(await refused.text()).not.toBe('a b\n');
	});

	test('a 404 is logged as a warning; a skipped path is not logged', async () => {
		entries.length = 0;
		await app.request('/nope');
		await app.request('/health');
		expect(entries).toHaveLength(1);
		expect(entries[0]).toMatchObject({ level: 'warn', status: 404 });
	});

	test('a log that fails never fails the request', async () => {
		const original = console.error;
		const reported: unknown[] = [];
		console.error = (error: unknown) => reported.push(error);
		try {
			const broken = alxia()
				.use(
					logger({
						write: () => {
							throw new Error('disk full');
						},
						skip: () => {
							throw new Error('bad skip');
						},
						generateId: () => 'not an id\n',
					}),
				)
				.get('/hello', ({ log, reply }) => {
					log.info('still answered');
					return reply(200, 'hi');
				});
			const response = await broken.request('/hello');
			expect(response.status).toBe(200);
			expect(await response.text()).toBe('hi');
			expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
			expect(response.headers.get('server-timing')).toStartWith('total;dur=');
			expect(reported.map(String)).toEqual([
				'Error: disk full',
				'Error: bad skip',
				'Error: disk full',
			]);
		} finally {
			console.error = original;
		}
	});

	test('an async write that rejects, and a generateId that throws, are reported', async () => {
		const original = console.error;
		const reported: unknown[] = [];
		console.error = (error: unknown) => reported.push(error);
		try {
			const app = alxia()
				.use(
					logger({
						write: async () => {
							throw new Error('remote down');
						},
						generateId: () => {
							throw new Error('no ids');
						},
					}),
				)
				.get('/', ({ reply }) => reply(200, 'ok'));
			const response = await app.request('/');
			await Bun.sleep(0);
			expect(response.status).toBe(200);
			expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/);
			expect(reported.map(String)).toEqual([
				'Error: no ids',
				'Error: remote down',
			]);
		} finally {
			console.error = original;
		}
	});
});
