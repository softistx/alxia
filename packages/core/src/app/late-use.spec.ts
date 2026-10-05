/**
 * The warning, in development, of a middleware given after the routes it
 * would have run on: once per app, naming them.
 */
import { afterEach, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { alxia } from './alxia';
import { defineMiddleware } from './define-middleware';

const pass = defineMiddleware((_ctx, next) => next());
let mode: string | undefined;
let warn: ReturnType<typeof spyOn<Console, 'warn'>>;

beforeEach(() => {
	mode = process.env.NODE_ENV;
	process.env.NODE_ENV = 'development';
	warn = spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
	if (mode === undefined) delete process.env.NODE_ENV;
	else process.env.NODE_ENV = mode;
	warn.mockRestore();
});

const warned = () => warn.mock.calls.map((call: unknown[]) => String(call[0]));

describe('use(middleware) after routes', () => {
	test('names the routes it does not run on, once', () => {
		alxia()
			.get('/a', ({ reply }) => reply(200, 'a'))
			.post('/b', ({ reply }) => reply(200, 'b'))
			.use(pass)
			.use(pass);
		expect(warned()).toEqual([
			'use(): the middleware runs on the routes declared after it and on requests no route matches, not on the 2 routes (GET /a, POST /b) declared before it. Give it to use() before them if they need it.',
		]);
	});

	test('given a path, only the routes under it', () => {
		alxia()
			.get('/public', ({ reply }) => reply(200, 'p'))
			.use('/admin', pass);
		alxia()
			.get('/admin/x', ({ reply }) => reply(200, 'x'))
			.use('/admin', pass);
		expect(warned()).toHaveLength(1);
		expect(warned()[0]).toContain('not on the route (GET /admin/x)');
	});

	test('says nothing before any route, in production or under test', () => {
		alxia()
			.use(pass)
			.get('/a', ({ reply }) => reply(200, 'a'));
		for (const quiet of ['production', 'test']) {
			process.env.NODE_ENV = quiet;
			alxia()
				.get('/a', ({ reply }) => reply(200, 'a'))
				.use(pass);
		}
		expect(warned()).toEqual([]);
	});
});
