import { describe, expect, expectTypeOf, test } from 'bun:test';
import type { CheckedPath, PathAt, RoutePath, StaticPath } from '../types/path';
import { alxia } from './alxia';

/**
 * A path the app refuses is refused by its type too, with the message the
 * app throws: each `@ts-expect-error` below is a path refused when typed,
 * and each call then throws that message when run.
 */
describe('the type of a path', () => {
	// A handler no request reaches: the only mistake left on a call is its path.
	const ok = (): never => {
		throw new Error('not requested');
	};

	test('refuses, as the app does, every path no route may be declared at', () => {
		const app = alxia();
		const refusals: [() => unknown, string][] = [
			// @ts-expect-error: a ":" inside a segment
			[() => app.get('/at/10:30', ok), '":" may only start a segment'],
			// @ts-expect-error: a ":" ending a segment
			[() => app.get('/x:', ok), '":" may only start a segment'],
			// @ts-expect-error: a "*" before the end
			[() => app.get('/a/*/b', ok), '"*" may only end a path'],
			// @ts-expect-error: a "*" inside a segment
			[() => app.get('/*.js', ok), '"*" may only be a whole segment'],
			// @ts-expect-error: a "*" inside a segment
			[() => app.get('/a*', ok), '"*" may only be a whole segment'],
			// @ts-expect-error: a parameter name with a dash
			[() => app.get('/a/:pet-id', ok), '":pet-id" is not a parameter name'],
			// @ts-expect-error: a parameter name starting with a digit
			[() => app.get('/a/:1', ok), '":1" is not a parameter name'],
			// @ts-expect-error: a parameter with no name
			[() => app.get('/a/:', ok), '":" is not a parameter name'],
			// @ts-expect-error: a name declared twice
			[() => app.get('/a/:id/b/:id', ok), 'declares ":id" twice'],
			// @ts-expect-error: a dot segment
			[() => app.get('/a/./b', ok), '"." is a dot segment'],
			// @ts-expect-error: a dot segment
			[() => app.get('/a/..', ok), '".." is a dot segment'],
			// @ts-expect-error: a dot segment, encoded
			[() => app.get('/a/%2E%2e', ok), '"%2E%2e" is a dot segment'],
		];
		for (const [declare, message] of refusals) {
			expect(declare).toThrow(message);
		}
	});

	test('refuses them on every method that declares a route', async () => {
		const bundle = (await import('../../test/fixtures/page.html')).default;
		const refused = [
			// @ts-expect-error: a ":" inside a segment
			() => alxia().post('/at/10:30', ok),
			// @ts-expect-error: a ":" inside a segment
			() => alxia().get('/at/10:30', {}, ok),
			// @ts-expect-error: a ":" inside a segment
			() => alxia().ws('/at/10:30', {}, { message: () => {} }),
			// @ts-expect-error: a ":" inside a segment
			() => alxia().page('/at/10:30', bundle),
			// @ts-expect-error: a ":" inside a segment
			() => alxia().file('/at/10:30', new Blob(['x'])),
			// @ts-expect-error: its route, `/assets/*/*`, has a "*" before the end
			() => alxia().static('/assets/*', '.'),
			() =>
				alxia().route(
					// @ts-expect-error: a ":" inside a segment
					{ method: 'GET', path: '/at/10:30' } as const,
					ok,
				),
		];
		for (const declare of refused) expect(declare).toThrow(TypeError);
	});

	test('reads the path under the prefix it is declared at', () => {
		// @ts-expect-error: ":id" twice, once in the prefix
		const declare = () => alxia({ prefix: '/u/:id' }).get('/:id', ok);
		expect(declare).toThrow('"/u/:id/:id" declares ":id" twice');
		const grouped = () =>
			// @ts-expect-error: ":id" twice, once in the group
			alxia().group('/u/:id', (u) => u.get('/:id', ok));
		expect(grouped).toThrow('"/u/:id/:id" declares ":id" twice');
	});

	test('names the path and why, as the app throws it', () => {
		expectTypeOf<
			PathAt<'/api', '/at/10:30'>
		>().toEqualTypeOf<'Invalid path: "/at/10:30": ":" may only start a segment, as a parameter'>();
		expectTypeOf<
			PathAt<'/u/:id', '/:id'>
		>().toEqualTypeOf<'Invalid path: "/:id" is refused under its prefix: the two declare one parameter twice, or the prefix holds a refused segment'>();
		expectTypeOf<PathAt<'/u/:id', '/files/*'>>().toEqualTypeOf<'/files/*'>();
		expectTypeOf<
			CheckedPath<'/at/10:30'>
		>().toEqualTypeOf<'Invalid path: "/at/10:30": ":" may only start a segment, as a parameter'>();
		expectTypeOf<
			CheckedPath<'/a/:id/:id'>
		>().toEqualTypeOf<'Invalid path: "/a/:id/:id" declares ":id" twice'>();
		expectTypeOf<
			CheckedPath<'/a/./b'>
		>().toEqualTypeOf<'Invalid path: "/a/./b": "." is a dot segment, which a request\'s URL never keeps'>();
	});

	test('accepts every path the app accepts', () => {
		const app = alxia()
			.get('/', ok)
			.get('/a/', ok)
			.get('/a//b', ok)
			.get('/caf%C3%A9', ok)
			.get('/a%20b', ok)
			.get('/100%', ok)
			.get('/a|b', ok)
			.get("/a'b~c", ok)
			.get('/.well-known/x', ok)
			.get('/a..b', ok)
			.get('/at/10h30', ok)
			.get('/at/:time', ok)
			.get('/u/:$id_2/files/*', ok)
			.get('/*', ok)
			.static('/assets', '.')
			.file('/favicon.ico', new Blob(['x']))
			.route({ method: 'GET', path: '/r/:id' } as const, ok);
		expect(app.routes.length).toBe(17);
	});

	test('checks a path forwarded by a wrapper where the wrapper is called', () => {
		const routedAt = <const P extends RoutePath>(path: PathAt<'', P>) =>
			alxia().get(path, ok);
		const servedAt = <const P extends RoutePath>(
			path: PathAt<'', P, StaticPath<P>>,
		) => alxia().static(path, '.');
		expect(routedAt('/pets/:id').routes[0]?.path).toBe('/pets/:id');
		expect(servedAt('/assets').routes[0]?.path).toBe('/assets/*');
		// @ts-expect-error: a ":" inside a segment
		expect(() => routedAt('/at/10:30')).toThrow('may only start a segment');
		// @ts-expect-error: its route, `/assets/*/*`, has a "*" before the end
		expect(() => servedAt('/assets/*')).toThrow('may only end a path');
	});

	test('leaves a path it cannot read to the app', () => {
		expectTypeOf<CheckedPath<string>>().toEqualTypeOf<string>();
		expectTypeOf<CheckedPath<RoutePath>>().toEqualTypeOf<RoutePath>();
		expectTypeOf<CheckedPath<`/u/${string}`>>().toEqualTypeOf<`/u/${string}`>();
		expectTypeOf<
			CheckedPath<`/u/:${string}`>
		>().toEqualTypeOf<`/u/:${string}`>();
		expectTypeOf<
			CheckedPath<`/u/:${string}/b/:id`>
		>().toEqualTypeOf<`/u/:${string}/b/:id`>();
		expectTypeOf<
			CheckedPath<`/a/${string}:x`>
		>().toEqualTypeOf<`/a/${string}:x`>();
		expectTypeOf<
			CheckedPath<`/a/${string}*`>
		>().toEqualTypeOf<`/a/${string}*`>();
		const path: RoutePath = '/at/10:30';
		expect(() => alxia().get(path, ok)).toThrow('may only start a segment');
	});
});
