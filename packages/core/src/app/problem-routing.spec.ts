/**
 * `alxia({ errors: 'problem' })`, the rest: the router's answers, what a
 * `settle` reads, a middleware answering in the app's format, the serving
 * app deciding; and `errors: 'json'`, the default, unchanged.
 */
import { describe, expect, test } from 'bun:test';
import { HttpError } from '../errors/errors';
import { problemOf } from '../errors/problems';
import { problem } from '../reply/problem';
import { alxia } from './alxia';
import { settle } from './boundary';
import { errorFormat } from './served';

const PROBLEM = 'application/problem+json';

const app = alxia({ errors: 'problem' })
	.post('/users', ({ reply }) => reply(201))
	.ws('/socket', { message: () => {} });

describe('errors: problem, around the routes', () => {
	test("the router's 404, 405 with Allow, and 426, with and without a chain", async () => {
		const chained = alxia({ errors: 'problem' })
			.use((_ctx, next) => next())
			.get('/users', ({ reply }) => reply(200))
			.ws('/socket', { message: () => {} });
		for (const served of [app, chained]) {
			const missing = await served.request('/nowhere');
			expect(missing.status).toBe(404);
			expect(missing.headers.get('content-type')).toBe(PROBLEM);
			expect(await missing.json()).toEqual({
				type: 'about:blank',
				title: 'Not Found',
				status: 404,
				detail: 'No route serves GET /nowhere',
				instance: '/nowhere',
			});
			const wrong = await served.request('/users', { method: 'DELETE' });
			expect(wrong.status).toBe(405);
			expect(wrong.headers.get('allow')).toMatch(/GET|POST/);
			expect(await wrong.json()).toMatchObject({
				title: 'Method Not Allowed',
				detail: '/users does not allow DELETE',
			});
			const socket = await served.request('/socket');
			expect(socket.status).toBe(426);
			expect(await socket.json()).toMatchObject({ title: 'Upgrade Required' });
		}
	});

	test('a settle reads the problem the route boundary sends', async () => {
		let seen: string | null = null;
		const observed = alxia({ errors: 'problem' })
			.use(async (ctx, next) => {
				const response = await settle(ctx, next());
				seen = response.headers.get('content-type');
				return response;
			})
			.get('/teapot', () => {
				throw new HttpError(418, undefined);
			});
		expect((await observed.request('/teapot')).status).toBe(418);
		expect(seen as string | null).toBe(PROBLEM);
	});

	test("errorFormat and problemOf answer a middleware's own error in the app's format", async () => {
		const make = (errors: 'json' | 'problem') =>
			alxia({ errors }).get('/paid', (ctx) =>
				errorFormat(ctx) === 'problem'
					? problem(
							problemOf(ctx, { status: 402, detail: 'Over quota', quota: 3 }),
						)
					: ctx.reply(402, { error: 'quota' }),
			);
		const asProblem = await make('problem').request('/paid');
		expect(asProblem.headers.get('content-type')).toBe(PROBLEM);
		expect(await asProblem.json()).toEqual({
			type: 'about:blank',
			title: 'Payment Required',
			status: 402,
			detail: 'Over quota',
			instance: '/paid',
			quota: 3,
		});
		expect(await (await make('json').request('/paid')).json()).toEqual({
			error: 'quota',
		});
	});

	test("the serving app decides: a plugin's routes follow it", async () => {
		const plugin = alxia().get('/teapot', () => {
			throw new HttpError(418, { error: 'teapot' });
		});
		const served = alxia({ errors: 'problem' }).plugin(plugin);
		const response = await served.request('/teapot');
		expect(response.headers.get('content-type')).toBe(PROBLEM);
	});

	test('an unknown format throws', () => {
		expect(() => alxia({ errors: 'xml' as never })).toThrow(
			`alxia(): errors must be 'json' or 'problem', not "xml"`,
		);
	});
});

describe('errors: json, the default', () => {
	test('the bodies of before', async () => {
		const plain = alxia()
			.get('/teapot', () => {
				throw new HttpError(418, { error: 'teapot' }, { detail: 'unused' });
			})
			.get('/users', ({ reply }) => reply(200));
		const teapot = await plain.request('/teapot');
		expect(teapot.headers.get('content-type')).toBe('application/json');
		expect(await teapot.json()).toEqual({ error: 'teapot' });
		expect(await (await plain.request('/nowhere')).json()).toEqual({
			error: 'not_found',
		});
		const wrong = await plain.request('/users', { method: 'PUT' });
		expect(await wrong.json()).toEqual({ error: 'method_not_allowed' });
	});

	test('HttpError still takes its message alone', () => {
		const error = new HttpError(404, undefined, 'no user 12');
		expect(error.message).toBe('no user 12');
		expect(error.detail).toBeUndefined();
	});
});
