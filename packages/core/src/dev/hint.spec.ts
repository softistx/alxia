/**
 * The hint a 404 or a 405 carries in dev: the closest route by a distance
 * on segments, the methods a path allows; in `json` and `problem` alike,
 * with a chain and without one; never outside dev.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '../app/alxia';
import { closestRoute, segmentDistance } from './hint';

const todos = (options: Parameters<typeof alxia>[0]) =>
	alxia(options)
		.get('/todos', ({ reply }) => reply(200, []))
		.get('/todos/:id', ({ reply }) => reply(200, 'todo'))
		.delete('/todos/:id', ({ reply }) => reply(204))
		.get('/assets/*', ({ reply }) => reply(200, 'file'));

describe('the closest route', () => {
	const declared = [
		['GET', '/todos'],
		['GET', '/todos/:id'],
		['POST', '/todos'],
		['GET', '/users/:id/posts'],
		['GET', '/assets/*'],
	] as const;

	test('a typo, a missing or an extra segment, a method of its own preferred', () => {
		expect(closestRoute('GET', '/todo/1', declared)).toBe('GET /todos/:id');
		expect(closestRoute('GET', '/Todos', declared)).toBe('GET /todos');
		expect(closestRoute('POST', '/todo', declared)).toBe('POST /todos');
		expect(closestRoute('GET', '/users/7/post', declared)).toBe(
			'GET /users/:id/posts',
		);
		expect(closestRoute('GET', '/asset/logo.svg', declared)).toBe(
			'GET /assets/*',
		);
		expect(closestRoute('HEAD', '/todo', declared)).toBe('GET /todos');
	});

	test('nothing when no route shares a word with the request', () => {
		expect(closestRoute('GET', '/zzz/qqq/rrr', declared)).toBeUndefined();
		expect(closestRoute('GET', '/orders', declared)).toBeUndefined();
		expect(closestRoute('GET', '/', declared)).toBeUndefined();
	});

	test('the distance: a parameter takes a segment, a wildcard the rest', () => {
		expect(segmentDistance(['todos', '1'], ['todos', ':id'])).toBe(0);
		expect(segmentDistance(['assets', 'a', 'b'], ['assets', '*'])).toBe(0);
		expect(segmentDistance(['todo'], ['todos'])).toBeCloseTo(0.2);
		expect(segmentDistance(['todos'], ['todos', ':id'])).toBe(1);
		expect(segmentDistance(['users'], ['todos'])).toBe(1);
	});
});

describe('the router answers with a hint in dev', () => {
	test('json: a 404 says the closest route, a 405 what the path allows', async () => {
		const app = todos({ dev: true });
		const missing = await app.request('/todo/1');
		expect(missing.status).toBe(404);
		expect(await missing.json()).toEqual({
			error: 'not_found',
			hint: 'did you mean GET /todos/:id?',
		});
		const wrong = await app.request('/todos/1', { method: 'POST' });
		expect(wrong.status).toBe(405);
		expect(wrong.headers.get('allow')).toBe('GET, DELETE');
		expect(await wrong.json()).toEqual({
			error: 'method_not_allowed',
			hint: '/todos/1 allows GET, DELETE',
		});
		expect(await (await app.request('/zzz')).json()).toEqual({
			error: 'not_found',
		});
	});

	test('problem: the hint is an extension member', async () => {
		const app = todos({ dev: true, errors: 'problem' });
		const missing = await app.request('/todo/1');
		expect(missing.headers.get('content-type')).toBe(
			'application/problem+json',
		);
		expect(await missing.json()).toMatchObject({
			status: 404,
			detail: 'No route serves GET /todo/1',
			hint: 'did you mean GET /todos/:id?',
		});
	});

	test("behind the app's chain, a group's and a plugin's routes among the candidates", async () => {
		const users = alxia().get('/users/:id', ({ reply }) => reply(200, 'u'));
		const app = alxia({ dev: true })
			.use((_ctx, next) => next())
			.group('/admin', (admin) =>
				admin.get('/stats', ({ reply }) => reply(200, 's')),
			)
			.plugin(users);
		expect((await (await app.request('/admin/stat')).json()).hint).toBe(
			'did you mean GET /admin/stats?',
		);
		expect((await (await app.request('/user/1')).json()).hint).toBe(
			'did you mean GET /users/:id?',
		);
	});

	test('never outside dev, in either format', async () => {
		for (const errors of ['json', 'problem'] as const) {
			const app = todos({ dev: false, errors });
			const missing = await (await app.request('/todo/1')).json();
			expect(missing).not.toHaveProperty('hint');
			const wrong = await (
				await app.request('/todos/1', { method: 'POST' })
			).json();
			expect(wrong).not.toHaveProperty('hint');
		}
		// `bun test` sets NODE_ENV=test: dev is off by default.
		const quiet = await (await todos({}).request('/todo/1')).json();
		expect(quiet).toEqual({ error: 'not_found' });
	});

	test("the serving app decides: a plugin's dev is not read", async () => {
		const plugin = alxia({ dev: true }).get('/todos', ({ reply }) =>
			reply(200, []),
		);
		const app = alxia({ dev: false }).plugin(plugin);
		expect(await (await app.request('/todo')).json()).toEqual({
			error: 'not_found',
		});
	});
});
