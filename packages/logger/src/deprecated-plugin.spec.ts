import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { type LogEntry, logger } from './logger';

describe('app.plugin(logger()), deprecated', () => {
	test('a route declared before it is logged too, as 0.3 hooks did', async () => {
		const entries: LogEntry[] = [];
		const app = alxia()
			.get('/early', ({ reply }) => reply(200, 'early'))
			.plugin(logger({ write: (entry) => entries.push(entry) }));
		const response = await app.request('/early');
		expect(response.headers.get('x-request-id')).not.toBeNull();
		expect(entries).toHaveLength(1);
	});
});
