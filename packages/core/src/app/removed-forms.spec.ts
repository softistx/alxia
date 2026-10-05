/**
 * The forms 0.5 removed are refused where they are written, saying what
 * replaced them: `use` given an app or nothing, a schema in a route's
 * options. A list of middlewares is refused in `route-operation.spec.ts`,
 * `plugin` given a middleware in `plugin.spec.ts`.
 */
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';

const untypedUse = () => alxia().use as (...args: unknown[]) => unknown;
const ok = ({ reply }: { reply: (status: 200, body: string) => never }) =>
	reply(200, 'x');

describe('use(), given anything but middlewares', () => {
	test('an app is a plugin, given to app.plugin()', () => {
		const plugin = alxia().decorate({ db: 1 });
		const middleware = (_ctx: unknown, next: () => unknown) => next();
		expect(() => untypedUse()(plugin)).toThrow(
			'use(): argument 1 is an app: a plugin is given to app.plugin(), use() takes middlewares',
		);
		expect(() => untypedUse()(middleware, plugin)).toThrow(
			'use(): argument 2 is an app',
		);
		expect(() => untypedUse()('/admin', plugin)).toThrow(
			'use("/admin"): argument 1 is an app',
		);
	});

	test('nothing, with or without a path, is refused', () => {
		expect(() => untypedUse()()).toThrow('use(): no middleware is given');
		expect(() => untypedUse()('/admin')).toThrow(
			'use("/admin"): no middleware is given',
		);
	});

	test('what is not a function is refused, by its place', () => {
		expect(() => untypedUse()(null)).toThrow(
			'use(): argument 1 is not a function: a middleware is (ctx, next) => …',
		);
		expect(() => untypedUse()('/admin', {})).toThrow(
			'use("/admin"): argument 1 is not a function',
		);
	});
});

describe("a schema in a route's options", () => {
	const options =
		'the options hold no schema (body): give validate(…) and responds(…) among the middlewares';

	test('is refused when the route is declared, every schema named', () => {
		const post = alxia().post as (...args: unknown[]) => unknown;
		expect(() => post('/', { body: z.object({}) }, ok)).toThrow(
			`POST /: ${options}`,
		);
		expect(() =>
			post('/', { query: z.object({}), response: { 200: z.string() } }, ok),
		).toThrow('POST /: the options hold no schema (query, response)');
		expect(() => post('/', { bodyLimit: 10 }, ok)).not.toThrow();
	});

	test('the 0.3 form, a schema before the handler, is the same mistake', () => {
		const get = alxia().get as (...args: unknown[]) => unknown;
		expect(() => get('/', { params: z.object({}) }, ok)).toThrow(
			'GET /: the options hold no schema (params)',
		);
	});

	test('is refused on a socket route', () => {
		const ws = alxia().ws as (...args: unknown[]) => unknown;
		expect(() =>
			ws('/live', { body: z.object({}) }, { message: () => {} }),
		).toThrow(`WS /live: ${options}`);
		expect(() =>
			ws('/live', { message: z.string() }, { message: () => {} }),
		).not.toThrow();
	});
});
