import { describe, expect, test } from 'bun:test';
import { alxia, eventStream } from '@alxia/core';
import { z } from 'zod';
import { exactly, implemented, type Operations } from './routes';

// alxia.ts as `@nxgt/openapi-codegen` writes it with `alxia: true`.
const zPet = z.object({ id: z.number(), name: z.string() });
const zNotFound = z.object({ title: z.string() });
const zHit = z.object({ id: z.string() });

const searchEmployees = {
	method: 'QUERY',
	path: '/employees',
	schema: {
		body: z.object({ name: z.string() }),
		response: { 200: z.array(zHit) },
		detail: { operationId: 'searchEmployees', tags: [] },
	},
} as const;

const getPet = {
	method: 'GET',
	path: '/pets/:petId',
	schema: {
		params: z.object({ petId: z.coerce.number().int() }),
		response: { 200: zPet, 404: zNotFound },
		detail: { operationId: 'getPet', summary: 'Fetch a pet.' },
	},
} as const;

const watchPets = {
	method: 'GET',
	path: '/pets/events',
	schema: {
		response: { 200: eventStream(zPet) },
		detail: { operationId: 'watchPets' },
	},
} as const;

const operations = { searchEmployees, getPet, watchPets } as const;

const pets = new Map([[1, { id: 1, name: 'Rex' }]]);

const routed = () =>
	alxia()
		.route(searchEmployees, ({ reply }) => reply.ok([]))
		.route(getPet, ({ params, reply }) => {
			const pet = pets.get(params.petId);
			return pet ? reply.ok(pet) : reply.notFound({ title: 'No such pet' });
		})
		.route(watchPets, ({ reply }) =>
			reply.ok(
				(async function* () {
					yield { id: 1, name: 'Rex' };
				})(),
			),
		);

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

	test('nothing to check', () => {
		expect(() => implemented(alxia(), {})).not.toThrow();
		expect(() => implemented(alxia(), [])).not.toThrow();
	});
});

describe('exactly', () => {
	test('passes when the routes are the operations', () => {
		expect(() => exactly(routed(), operations)).not.toThrow();
	});

	test('lists each route no operation declares', () => {
		const app = routed()
			.post('/admin/reset', ({ reply }) => reply(204))
			.get('/health', ({ reply }) => reply(200, 'ok'));
		expect(() => exactly(app, operations)).toThrow(
			new TypeError(
				'exactly(): 2 routes have no operation: POST /admin/reset, GET /health',
			),
		);
		const one = routed().get('/health', ({ reply }) => reply(200, 'ok'));
		expect(() => exactly(one, operations)).toThrow(
			new TypeError('exactly(): 1 route has no operation: GET /health'),
		);
	});

	test('both lists at once, the missing operations first', () => {
		const app = alxia()
			.route(getPet, ({ reply }) => reply.notFound({ title: 'x' }))
			.get('/health', ({ reply }) => reply(200, 'ok'));
		expect(() => exactly(app, { getPet, searchEmployees })).toThrow(
			new TypeError(
				'exactly(): 1 operation has no route: QUERY /employees (searchEmployees); 1 route has no operation: GET /health',
			),
		);
	});

	test('exclude: a route the document does not have to declare', () => {
		const app = routed().get('/health', ({ reply }) => reply(200, 'ok'));
		expect(() =>
			exactly(app, operations, {
				exclude: (route) => route.path === '/health',
			}),
		).not.toThrow();
	});

	test('under a prefix, the routes listed as the app serves them', () => {
		const app = alxia({ prefix: '/api' })
			.route(getPet, ({ reply }) => reply.notFound({ title: 'x' }))
			.get('/health', ({ reply }) => reply(200, 'ok'));
		expect(() => exactly(app, { getPet }, { prefix: '/api' })).toThrow(
			new TypeError('exactly(): 1 route has no operation: GET /api/health'),
		);
	});
});

describe('the operations it takes', () => {
	test('the generated object, a list, and core’s RouteOperation', () => {
		const asRecord: Operations = operations;
		const asList: Operations = [searchEmployees, getPet, watchPets];
		const asData: Operations = [{ method: 'DELETE', path: '/pets/:petId' }];
		expect([asRecord, asList, asData]).toHaveLength(3);
		const _refused = () => {
			// @ts-expect-error a method alxia cannot route
			implemented(alxia(), [{ method: 'TRACE', path: '/x' }]);
			// @ts-expect-error a path must start with "/"
			implemented(alxia(), { x: { method: 'GET', path: 'pets' } });
			// @ts-expect-error an object that is not an app
			implemented({}, operations);
		};
		expect(_refused).toBeFunction();
	});
});
