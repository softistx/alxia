import { describe, expect, test } from 'bun:test';
import { alxia, trustProxy } from '@alxia/core';
import { type LogEntry, logger } from './logger';

describe('the proxy secret header', () => {
	test('appears in no log line, for a right or a wrong secret', async () => {
		const secret = 'k3y-0f-sixteen+chars';
		const lines: string[] = [];
		const entries: LogEntry[] = [];
		const app = alxia({
			proxy: trustProxy({
				trusted: 1,
				secret: { header: 'x-app-proxy-secret', value: secret },
			}),
		})
			.use(
				logger({
					write: (entry) => {
						entries.push(entry);
						lines.push(JSON.stringify(entry));
					},
				}),
			)
			.get('/', ({ log, reply }) => {
				log.info('seen');
				return reply(200, { ok: true });
			});
		for (const sent of [secret, 'a-wrong-secret-value']) {
			await app.request('/', {
				headers: {
					'x-forwarded-for': '203.0.113.9',
					'x-app-proxy-secret': sent,
				},
			});
		}
		expect(entries.length).toBeGreaterThan(0);
		for (const line of lines) {
			expect(line).not.toContain(secret);
			expect(line).not.toContain('a-wrong-secret-value');
		}
	});
});
