/**
 * A preflight carries no credentials: cors answers it before any guard
 * runs, a guarded group's included, whose 405 its guard now refuses.
 */
import { describe, expect, test } from 'bun:test';
import { alxia, type BaseContext, defineMiddleware } from '@alxia/core';
import { cors } from './cors';

const guard = defineMiddleware(({ request, reply }, next) =>
	request.headers.has('authorization')
		? next()
		: reply(401, { error: 'unauthorized' as const }),
);

const preflight = (path: string) =>
	new Request(`http://localhost${path}`, {
		method: 'OPTIONS',
		headers: {
			origin: 'https://app.example',
			'access-control-request-method': 'DELETE',
		},
	});

const secret = ({ reply }: BaseContext) => reply(200, 's');

describe('cors and a guarded group', () => {
	const apps = () =>
		[
			[
				alxia()
					.use(cors())
					.group((g) => g.use(guard).get('/secret', secret)),
				'/secret',
			],
			[
				alxia()
					.use(cors())
					.group('/admin', (g) => g.use(guard).get('/secret', secret)),
				'/admin/secret',
			],
			// Declared after the routes, cors still runs first on what no route matches.
			[
				alxia()
					.group((g) => g.use(guard).get('/secret', secret))
					.use(cors()),
				'/secret',
			],
		] as const;

	test('a preflight is answered, its guard never run', async () => {
		for (const [app, path] of apps()) {
			const response = await app.fetch(preflight(path));
			expect(response.status).toBe(204);
			expect(response.headers.get('access-control-allow-origin')).toBe('*');
		}
	});

	test("the guard refuses the 405 of a request it does not let through, cors's headers on it", async () => {
		for (const [app, path] of apps()) {
			const response = await app.request(path, {
				method: 'DELETE',
				headers: { origin: 'https://app.example' },
			});
			expect(response.status).toBe(401);
			expect(response.headers.get('allow')).toBeNull();
			expect(response.headers.get('access-control-allow-origin')).toBe('*');
		}
	});
});
