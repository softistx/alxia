/**
 * A factory given uncalled — `use(cors)` for `use(cors())` — throws where
 * it is declared, naming it, on every form that takes a middleware and on
 * `plugin`; one nobody marked is told so on its first request.
 */
import { describe, expect, spyOn, test } from 'bun:test';
import { health } from '../health/health';
import { alxia } from './alxia';
import { factoryOf, markFactory } from './factory';
import type { Middleware } from './types';

function audit(_options: { level?: string } = {}): Middleware {
	return function audit(_ctx, next) {
		return next();
	};
}
markFactory(audit);

const uncalled = audit as never;
const ok = () => new Response('ok');

describe('a marked factory given uncalled', () => {
	test('use(), with a path or not', () => {
		expect(() => alxia().use(uncalled)).toThrow(
			'use(): argument 1 looks like a factory (audit): call it, use(audit())',
		);
		expect(() => alxia().use('/admin', audit(), uncalled)).toThrow(
			'use("/admin"): argument 2 looks like a factory (audit): call it, use(audit())',
		);
	});

	test("a route's, a socket's and an operation's middlewares", () => {
		const middleware1 =
			"middleware 1 looks like a factory (audit): call it, audit() among the route's middlewares";
		expect(() => alxia().get('/x', uncalled, ok as never)).toThrow(
			`GET /x: ${middleware1}`,
		);
		expect(() =>
			alxia().ws('/chat', uncalled, { message: () => {} } as never),
		).toThrow(`WS /chat: ${middleware1}`);
		const operation = { method: 'GET', path: '/y', schema: {} } as const;
		expect(() => alxia().route(operation, uncalled, ok as never)).toThrow(
			`GET /y: ${middleware1}`,
		);
	});

	test('plugin(), a middleware factory or a plugin one', () => {
		expect(() => alxia().plugin(uncalled)).toThrow(
			'plugin(): argument 1 looks like a factory (audit): call it, and give the middleware it makes to use(): use(audit())',
		);
		expect(() => alxia().plugin(health as never)).toThrow(
			'plugin(): argument 1 looks like a factory (health): call it, plugin(health())',
		);
		expect(() => alxia().use(health as never)).toThrow(
			'use(): argument 1 looks like a factory (health): call it, and give the plugin it makes to plugin(): plugin(health())',
		);
	});

	test('called, it is the middleware it makes, and the mark is read alone', () => {
		const app = alxia()
			.use(audit())
			.get('/', ({ reply }) => reply(200, 'ok'));
		expect(app.routes).toHaveLength(1);
		expect(factoryOf(audit)).toBe('middleware');
		expect(factoryOf(health)).toBe('plugin');
		expect(factoryOf(audit())).toBeUndefined();
		expect(markFactory(audit)).toBe(audit);
		expect(() => markFactory('audit' as never)).toThrow(
			'markFactory(): the factory is not a function',
		);
	});
});

test('a factory nobody marked is told on its first request what it looks like', async () => {
	const unmarked = (_options?: object): Middleware =>
		function inner(_ctx, next) {
			return next();
		};
	const error = spyOn(console, 'error').mockImplementation(() => {});
	try {
		const app = alxia()
			.use(unmarked as never)
			.get('/', ({ reply }) => reply(200, 'ok'));
		expect((await app.request('/')).status).toBe(500);
		expect(String(error.mock.calls[0]?.[0])).toContain(
			'a middleware (unmarked) returned function: it looks like a factory given uncalled, call it, use(unmarked())',
		);
	} finally {
		error.mockRestore();
	}
});
