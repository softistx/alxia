import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia } from '../app/alxia';
import { joinPath, shapeOf } from './paths';

describe('joinPath', () => {
	test('puts the path under the prefix', () => {
		expect(joinPath('/api', '/pets')).toBe('/api/pets');
		expect(joinPath('/api', '/pets/:id')).toBe('/api/pets/:id');
	});

	test('takes `/` under a prefix as the prefix itself', () => {
		expect(joinPath('/api', '/')).toBe('/api');
	});

	test('leaves the path as it is under no prefix', () => {
		expect(joinPath('', '/')).toBe('/');
		expect(joinPath('', '/pets')).toBe('/pets');
	});

	test('is typed as JoinPath', () => {
		expectTypeOf(joinPath('/api', '/pets')).toEqualTypeOf<'/api/pets'>();
		expectTypeOf(joinPath('/api', '/')).toEqualTypeOf<'/api'>();
		expectTypeOf(joinPath('', '/pets')).toEqualTypeOf<'/pets'>();
		// @ts-expect-error: the prefix is not the path.
		expectTypeOf(joinPath('/api', '/pets')).toEqualTypeOf<'/pets'>();
	});

	test('joins as the app does, under a prefix and a group', () => {
		const app = alxia({ prefix: '/api' })
			.get('/', ({ reply }) => reply(200, 'root'))
			.group('/v1', (v1) =>
				v1
					.get('/', ({ reply }) => reply(200, 'v1'))
					.get('/pets', ({ reply }) => reply(200, 'pets')),
			);
		expect(app.routes.map((route) => route.path)).toEqual([
			joinPath('/api', '/'),
			joinPath(joinPath('/api', '/v1'), '/'),
			joinPath(joinPath('/api', '/v1'), '/pets'),
		]);
	});
});

describe('shapeOf', () => {
	test('erases parameter names', () => {
		expect(shapeOf('/pets/:id')).toBe('/pets/:');
		expect(shapeOf('/pets/:id')).toBe(shapeOf('/pets/:petId'));
		expect(shapeOf('/users/:id/posts/*')).toBe('/users/:/posts/*');
	});

	test('keeps literal segments', () => {
		expect(shapeOf('/pets')).toBe('/pets');
		expect(shapeOf('/at/10h30')).toBe('/at/10h30');
		expect(shapeOf('/at/10h30')).not.toBe(shapeOf('/at/10h45'));
	});

	test('gives one shape to the paths the router refuses as the same', () => {
		const app = alxia().get('/pets/:id', ({ reply }) => reply(200, 'pet'));
		expect(() =>
			app.get('/pets/:petId', ({ reply }) => reply(200, 'pet')),
		).toThrow('has the shape of');
	});

	test('throws a TypeError for a path no route may be declared at', () => {
		expect(() => shapeOf('pets')).toThrow(TypeError);
		expect(() => shapeOf('pets')).toThrow('must start with "/"');
		expect(() => shapeOf('/a/*/b')).toThrow('may only end a path');
		expect(() => shapeOf('/a/:pet-id')).toThrow('is not a parameter name');
		expect(() => shapeOf('/a/:id/:id')).toThrow('twice');
		expect(() => shapeOf('/at/10:30')).toThrow('may only start a segment');
		expect(() => shapeOf('/caf\u00e9')).toThrow('declare "/caf%C3%A9"');
	});
});
