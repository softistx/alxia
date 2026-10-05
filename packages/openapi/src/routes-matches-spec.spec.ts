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

	test('lists each route no operation declares', () => {
		const app = routed()
			.post('/admin/reset', ({ reply }) => reply(204))
			.get('/health', ({ reply }) => reply(200, 'ok'));
		expect(() => matchesSpec(app, operations)).toThrow(
			new TypeError(
				'matchesSpec(): 2 routes have no operation: POST /admin/reset, GET /health',
			),
		);
		const one = routed().get('/health', ({ reply }) => reply(200, 'ok'));
		expect(() => matchesSpec(one, operations)).toThrow(
			new TypeError('matchesSpec(): 1 route has no operation: GET /health'),
		);
	});

	test('both lists at once, the missing operations first', () => {
		const app = alxia()
			.route(getPet, ({ reply }) => reply.notFound({ title: 'x' }))
			.get('/health', ({ reply }) => reply(200, 'ok'));
		expect(() => matchesSpec(app, { getPet, searchEmployees })).toThrow(
			new TypeError(
				'matchesSpec(): 1 operation has no route: QUERY /employees (searchEmployees); 1 route has no operation: GET /health',
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
		expect(() => matchesSpec(app, [head])).toThrow(
			new TypeError('matchesSpec(): 1 route has no operation: GET /pets'),
		);
		const get = { method: 'GET', path: '/pets' } as const;
		expect(() => matchesSpec(app, [head, get])).not.toThrow();
	});

	test('exclude: a route the document does not have to declare', () => {
		const app = routed().get('/health', ({ reply }) => reply(200, 'ok'));
		expect(() =>
			matchesSpec(app, operations, {
				exclude: (route) => route.path === '/health',
			}),
		).not.toThrow();
	});

	test("the probes of core's health() are left out already, under a prefix too", () => {
		const app = routed()
			.plugin(health())
			.group('/ops', (group) => group.plugin(health()));
		expect(() => matchesSpec(app, operations)).not.toThrow();
	});

	test('under a prefix, the routes listed as the app serves them', () => {
		const app = alxia({ prefix: '/api' })
			.route(getPet, ({ reply }) => reply.notFound({ title: 'x' }))
			.get('/health', ({ reply }) => reply(200, 'ok'));
		expect(() => matchesSpec(app, { getPet }, { prefix: '/api' })).toThrow(
			new TypeError('matchesSpec(): 1 route has no operation: GET /api/health'),
		);
	});
});
