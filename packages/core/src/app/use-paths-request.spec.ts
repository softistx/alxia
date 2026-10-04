/**
 * `use(path, guard)` matched against the request's path, not the route's
 * declared one: todo until `use` wraps the router, the next slice. Today
 * a route whose declared path reaches the guarded one through a parameter
 * or a wildcard serves it without the guard, as the guide says.
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alxia } from './alxia';
import { defineMiddleware } from './define-middleware';

/** A 401 unless `x-admin` is sent; adds nothing. */
const admin = defineMiddleware(({ request, reply }, next) =>
	request.headers.has('x-admin')
		? next()
		: reply(401, { error: 'admins only' as const }),
);

describe('use(path, guard), on a request under its path', () => {
	test.todo('guards a static mount at /', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'alxia-use-'));
		writeFileSync(join(dir, 'admin'), 'secret');
		const app = alxia().use('/admin', admin).static('/', dir);
		expect((await app.request('/admin')).status).toBe(401);
	});

	test.todo('guards a catch-all route', async () => {
		const app = alxia()
			.use('/admin', admin)
			.get('/*', ({ reply }) => reply(200, 'page'));
		expect((await app.request('/admin/users')).status).toBe(401);
	});

	test.todo('guards a route whose parameter takes the guarded segment', async () => {
		const app = alxia()
			.use('/admin', admin)
			.get('/:section/users', ({ reply }) => reply(200, 'users'));
		expect((await app.request('/admin/users')).status).toBe(401);
		expect((await app.request('/public/users')).status).toBe(200);
	});

	test.todo('guards a wildcard under a literal path', async () => {
		const app = alxia()
			.use('/files/secret', admin)
			.get('/files/*', ({ reply }) => reply(200, 'file'));
		expect((await app.request('/files/secret/key')).status).toBe(401);
		expect((await app.request('/files/open')).status).toBe(200);
	});
});
