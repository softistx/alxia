import { describe, expect, test } from 'bun:test';
import { alxia, health } from '@alxia/core';
import {
	getPet,
	operations,
	routed,
	searchEmployees,
} from '../test/openapi-helpers';
import { implemented, matchesSpec } from './routes';

describe('matchesSpec', () => {
	test('passes when the routes are the operations', () => {
		expect(() => matchesSpec(routed(), operations)).not.toThrow();
	});

	test('a route no operation declares passes, and is the report’s extra', () => {
		const app = routed()
			.post('/admin/reset', ({ reply }) => reply(204))
			.get('/health', ({ reply }) => reply(200, 'ok'));
		expect(matchesSpec(app, operations).extra).toEqual([
			{ method: 'POST', path: '/admin/reset' },
			{ method: 'GET', path: '/health' },
		]);
		expect(matchesSpec(routed(), operations).extra).toEqual([]);
	});

	test('strict lists each route no operation declares', () => {
		const app = routed()
			.post('/admin/reset', ({ reply }) => reply(204))
			.get('/health', ({ reply }) => reply(200, 'ok'));
		expect(() => matchesSpec(app, operations, { strict: true })).toThrow(
			new TypeError(
				'matchesSpec(): 2 routes have no operation: POST /admin/reset, GET /health',
			),
		);
		const one = routed().get('/health', ({ reply }) => reply(200, 'ok'));
		expect(() => matchesSpec(one, operations, { strict: true })).toThrow(
			new TypeError('matchesSpec(): 1 route has no operation: GET /health'),
		);
		expect(matchesSpec(routed(), operations, { strict: true }).extra).toEqual(
			[],
		);
	});

	test('an operation with no route fails, extra routes or not', () => {
		const app = alxia()
			.route(getPet, ({ reply }) => reply.notFound({ title: 'x' }))
			.get('/health', ({ reply }) => reply(200, 'ok'));
		expect(() => matchesSpec(app, { getPet, searchEmployees })).toThrow(
			new TypeError(
				'matchesSpec(): 1 operation has no route: QUERY /employees (searchEmployees)',
			),
		);
		expect(() =>
			matchesSpec(app, { getPet, searchEmployees }, { strict: true }),
		).toThrow(
			new TypeError(
				'matchesSpec(): 1 operation has no route: QUERY /employees (searchEmployees); 1 route has no operation: GET /health',
			),
		);
	});

	test('a route of the wrong method fails, strict or not', () => {
		const app = alxia().put('/pets/:petId', ({ reply }) => reply(200, 'x'));
		const message =
			'matchesSpec(): 1 operation has no route: GET /pets/:petId (getPet)';
		expect(() => matchesSpec(app, { getPet })).toThrow(new TypeError(message));
		expect(() => matchesSpec(app, { getPet }, { strict: true })).toThrow(
			new TypeError(`${message}; 1 route has no operation: PUT /pets/:petId`),
		);
	});

	test('a route of the wrong path fails', () => {
		const app = alxia().get('/animals/:petId', ({ reply }) => reply(200, 'x'));
		expect(() => matchesSpec(app, { getPet })).toThrow(
			new TypeError(
				'matchesSpec(): 1 operation has no route: GET /pets/:petId (getPet)',
			),
		);
	});

	test('a route of the same shape is the operation’s', () => {
		const app = alxia().get('/pets/:id', ({ reply }) => reply(200, 'x'));
		expect(() => matchesSpec(app, { getPet })).not.toThrow();
	});

	test('a colon inside a segment throws, as the core does', () => {
		const app = alxia().get('/at/:time', ({ reply }) => reply(200, 'x'));
		const other = { method: 'GET', path: '/at/10:45' } as const;
		expect(() => matchesSpec(app, [other])).toThrow(
			new TypeError(
				'matchesSpec(): "/at/10:45": ":" may only start a segment, as a parameter',
			),
		);
	});

	test('an operation path no route may be declared at throws, as the core does', () => {
		const bad = { method: 'GET', path: '/pets/:pet-id' } as const;
		expect(() => implemented(alxia(), [bad])).toThrow(
			new TypeError(
				'implemented(): "/pets/:pet-id": ":pet-id" is not a parameter name',
			),
		);
		expect(() => matchesSpec(alxia(), [bad])).toThrow(
			new TypeError(
				'matchesSpec(): "/pets/:pet-id": ":pet-id" is not a parameter name',
			),
		);
	});

	test('a HEAD operation: its GET route is served, but not declared', () => {
		const app = alxia().get('/pets', ({ reply }) => reply(200, 'x'));
		const head = { method: 'HEAD', path: '/pets' } as const;
		expect(() => matchesSpec(app, [head], { strict: true })).toThrow(
			new TypeError('matchesSpec(): 1 route has no operation: GET /pets'),
		);
		expect(matchesSpec(app, [head]).extra).toEqual([
			{ method: 'GET', path: '/pets' },
		]);
		const get = { method: 'GET', path: '/pets' } as const;
		expect(() => matchesSpec(app, [head, get])).not.toThrow();
	});

	test('exclude: under strict, a route the document does not have to declare', () => {
		const app = routed().get('/health', ({ reply }) => reply(200, 'ok'));
		const exclude = (route: { path: string }) => route.path === '/health';
		expect(() =>
			matchesSpec(app, operations, { strict: true, exclude }),
		).not.toThrow();
		expect(matchesSpec(app, operations, { exclude }).extra).toEqual([]);
	});

	test("the probes of core's health() are left out already, under a prefix too", () => {
		const app = routed()
			.plugin(health())
			.group('/ops', (group) => group.plugin(health()));
		expect(() => matchesSpec(app, operations, { strict: true })).not.toThrow();
		expect(matchesSpec(app, operations).extra).toEqual([]);
	});

	test('under a prefix, the routes listed as the app serves them', () => {
		const app = alxia({ prefix: '/api' })
			.route(getPet, ({ reply }) => reply.notFound({ title: 'x' }))
			.get('/health', ({ reply }) => reply(200, 'ok'));
		expect(matchesSpec(app, { getPet }, { prefix: '/api' }).extra).toEqual([
			{ method: 'GET', path: '/api/health' },
		]);
		expect(() =>
			matchesSpec(app, { getPet }, { prefix: '/api', strict: true }),
		).toThrow(
			new TypeError('matchesSpec(): 1 route has no operation: GET /api/health'),
		);
	});
});
