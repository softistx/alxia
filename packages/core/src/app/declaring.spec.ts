import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import { responds, validate } from './validate';

describe('declaring', () => {
	test('a route without a handler throws, naming its method and path', () => {
		const app = alxia() as unknown as { get(path: string): unknown };
		expect(() => app.get('/x')).toThrow('GET /x: the handler is missing');
	});

	test('a validate or responds where the handler goes is a missing handler', () => {
		const app = alxia() as unknown as {
			get(path: string, ...rest: unknown[]): unknown;
		};
		expect(() => app.get('/x', validate({}))).toThrow(
			'GET /x: the handler is missing',
		);
		expect(() => app.get('/x', responds({ 200: z.null() }))).toThrow(
			'GET /x: the handler is missing',
		);
	});

	test('a group without a build throws', () => {
		const app = alxia() as unknown as { group(prefix: string): unknown };
		expect(() => app.group('/x')).toThrow('group(): build is missing');
	});

	test("a group without a prefix declares its routes under the app's", async () => {
		const app = alxia({ prefix: '/api' }).group((group) =>
			group.get('/ping', ({ reply }) => reply(200, 'pong')),
		);
		const response = await app.request('/api/ping');
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('pong');
	});

	test('a hook method taken off the app stays bound to it', async () => {
		const app = alxia();
		const { use } = app;
		use(() => new Response(null, { status: 418 }));
		expect((await app.request('/')).status).toBe(418);
	});
});
