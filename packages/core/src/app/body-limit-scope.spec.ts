/**
 * `bodyLimit(bytes)` for the routes declared after it: a route's own
 * limit, a group's and a plugin's.
 */
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import { validate } from './validate';

const post = (body: string): RequestInit => ({
	method: 'POST',
	body,
	headers: { 'content-type': 'text/plain' },
});

describe('bodyLimit() for the routes after it', () => {
	const app = alxia()
		.post('/before', validate({ body: z.string() }), ({ reply }) =>
			reply(200, 'ok'),
		)
		.bodyLimit(4)
		.post('/after', validate({ body: z.string() }), ({ reply }) =>
			reply(200, 'ok'),
		)
		.post(
			'/own',
			{ bodyLimit: 16 },
			validate({ body: z.string() }),
			({ reply }) => reply(200, 'ok'),
		)
		.group('/admin', (admin) =>
			admin
				.post('/inherits', validate({ body: z.string() }), ({ reply }) =>
					reply(200, 'ok'),
				)
				.bodyLimit(2)
				.post('/tighter', validate({ body: z.string() }), ({ reply }) =>
					reply(200, 'ok'),
				),
		)
		.post('/outside', validate({ body: z.string() }), ({ reply }) =>
			reply(200, 'ok'),
		);

	const status = async (path: string, body: string) =>
		(await app.request(path, post(body))).status;

	test('a route declared before it has no limit', async () => {
		expect(await status('/before', 'x'.repeat(1024))).toBe(200);
	});

	test('a route after it takes it, unless its own says otherwise', async () => {
		expect(await status('/after', 'xxxx')).toBe(200);
		expect(await status('/after', 'xxxxx')).toBe(413);
		expect(await status('/own', 'x'.repeat(16))).toBe(200);
		expect(await status('/own', 'x'.repeat(17))).toBe(413);
	});

	test('a group inherits it, and keeps its own inside', async () => {
		expect(await status('/admin/inherits', 'xxxx')).toBe(200);
		expect(await status('/admin/inherits', 'xxxxx')).toBe(413);
		expect(await status('/admin/tighter', 'xxx')).toBe(413);
		expect(await status('/outside', 'xxx')).toBe(200);
	});

	test("a plugin's routes keep their own limit, the app's bodyLimit() never reaching them", async () => {
		const plugin = alxia()
			.post('/free', validate({ body: z.string() }), ({ reply }) =>
				reply(200, 'ok'),
			)
			.post(
				'/own',
				{ bodyLimit: 8 },
				validate({ body: z.string() }),
				({ reply }) => reply(200, 'ok'),
			);
		const host = alxia().bodyLimit(4).plugin(plugin);
		expect((await host.request('/free', post('xxxxx'))).status).toBe(200);
		expect((await host.request('/own', post('xxxxxxxx'))).status).toBe(200);
		expect((await host.request('/own', post('xxxxxxxxx'))).status).toBe(413);
		expect(host.routes.map((route) => route.bodyLimit)).toEqual([undefined, 8]);
	});

	test("a plugin's own bodyLimit() applies to the app's routes after use", async () => {
		const host = alxia()
			.plugin(alxia().bodyLimit(4))
			.post('/after', validate({ body: z.string() }), ({ reply }) =>
				reply(200, 'ok'),
			);
		expect((await host.request('/after', post('xxxx'))).status).toBe(200);
		expect((await host.request('/after', post('xxxxx'))).status).toBe(413);
		expect(host.routes[0]?.bodyLimit).toBe(4);
	});
});
