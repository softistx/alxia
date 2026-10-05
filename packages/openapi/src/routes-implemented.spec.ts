import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import {
	getPet,
	operations,
	routed,
	searchEmployees,
	watchPets,
} from '../test/openapi-helpers';
import { implemented, matchesSpec } from './routes';

describe('implemented', () => {
	test('passes when every operation has a route', () => {
		expect(() => implemented(routed(), operations)).not.toThrow();
	});

	test('lists each operation that has none, by method, path and name', () => {
		const app = alxia().route(watchPets, ({ reply }) =>
			reply.ok((async function* () {})()),
		);
		expect(() => implemented(app, operations)).toThrow(
			new TypeError(
				'implemented(): 2 operations have no route: QUERY /employees (searchEmployees), GET /pets/:petId (getPet)',
			),
		);
		expect(() => implemented(alxia(), { getPet })).toThrow(
			new TypeError(
				'implemented(): 1 operation has no route: GET /pets/:petId (getPet)',
			),
		);
	});

	test('a route of the same shape, another method, extra routes', () => {
		// Declared by hand, with its own parameter name: it serves the operation.
		const app = alxia()
			.get('/pets/:id', ({ reply }) => reply(200, 'x'))
			.post('/admin/reset', ({ reply }) => reply(204));
		expect(() => implemented(app, { getPet })).not.toThrow();
		// Another method is not the operation's.
		const posted = alxia().post('/employees', ({ reply }) => reply(204));
		expect(() => implemented(posted, { searchEmployees })).toThrow(
			'1 operation has no route: QUERY /employees (searchEmployees)',
		);
	});

	test('a HEAD operation is served by the GET route', () => {
		const head = { method: 'HEAD', path: '/pets' } as const;
		const app = alxia().get('/pets', ({ reply }) => reply(200, 'x'));
		expect(() => implemented(app, [head])).not.toThrow();
		expect(() => implemented(alxia(), [head])).toThrow(
			'implemented(): 1 operation has no route: HEAD /pets',
		);
	});

	test('a list: named by its operation id, when it has one', () => {
		const health = { method: 'GET', path: '/health' } as const;
		expect(() => implemented(alxia(), [getPet, health])).toThrow(
			'implemented(): 2 operations have no route: GET /pets/:petId (getPet), GET /health',
		);
	});

	test('under the prefix the app gave its routes', () => {
		const app = alxia({ prefix: '/api' })
			.route(getPet, ({ reply }) => reply.notFound({ title: 'x' }))
			.group('/v1', (v1) => v1.get('/', ({ reply }) => reply(200, 'x')));
		const root = { method: 'GET', path: '/' } as const;
		expect(() => implemented(app, { getPet })).toThrow(
			'GET /pets/:petId (getPet)',
		);
		expect(() =>
			implemented(app, { getPet }, { prefix: '/api' }),
		).not.toThrow();
		expect(() =>
			implemented(app, { root }, { prefix: '/api/v1' }),
		).not.toThrow();
		expect(() => implemented(app, { root }, { prefix: '/api' })).toThrow(
			'implemented(): 1 operation has no route: GET /api (root)',
		);
	});

	test('a prefix written as the app would refuse it', () => {
		const app = alxia({ prefix: '/api' }).route(getPet, ({ reply }) =>
			reply.notFound({ title: 'x' }),
		);
		expect(() => implemented(app, { getPet }, { prefix: '/api/' })).toThrow(
			new TypeError(
				'implemented(): the prefix "/api/" must start with "/" and not end with one',
			),
		);
		expect(() => matchesSpec(app, { getPet }, { prefix: '/api/' })).toThrow(
			'matchesSpec(): the prefix "/api/" must start with "/" and not end with one',
		);
	});

	test('nothing to check', () => {
		expect(() => implemented(alxia(), {})).not.toThrow();
		expect(() => implemented(alxia(), [])).not.toThrow();
	});
});
