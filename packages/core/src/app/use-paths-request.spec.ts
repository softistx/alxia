/**
 * `use(path, guard)` matched against the request's path, not the route's
 * declared one: a route whose declared path reaches the guarded one
 * through a parameter or a wildcard runs the guard on the requests under
 * it, and only on those.
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
	test('guards a static mount at /', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'alxia-use-'));
		writeFileSync(join(dir, 'admin'), 'secret');
		writeFileSync(join(dir, 'public'), 'open');
		const app = alxia().use('/admin', admin).static('/', dir);
		expect((await app.request('/admin')).status).toBe(401);
		const allowed = await app.request('/admin', {
			headers: { 'x-admin': '1' },
		});
		expect(await allowed.text()).toBe('secret');
		expect((await app.request('/public')).status).toBe(200);
	});

	test('guards a catch-all route', async () => {
		const app = alxia()
			.use('/admin', admin)
			.get('/*', ({ reply }) => reply(200, 'page'));
		expect((await app.request('/admin/users')).status).toBe(401);
		expect((await app.request('/admin')).status).toBe(401);
		expect((await app.request('/administrators')).status).toBe(200);
	});

	test('guards a route whose parameter takes the guarded segment', async () => {
		const app = alxia()
			.use('/admin', admin)
			.get('/:section/users', ({ reply }) => reply(200, 'users'));
		expect((await app.request('/admin/users')).status).toBe(401);
		expect((await app.request('/public/users')).status).toBe(200);
	});

	test('guards a wildcard under a literal path', async () => {
		const app = alxia()
			.use('/files/secret', admin)
			.get('/files/*', ({ reply }) => reply(200, 'file'));
		expect((await app.request('/files/secret/key')).status).toBe(401);
		expect((await app.request('/files/open')).status).toBe(200);
	});

	test('a request under a path on no route runs the guard before its 404', async () => {
		const app = alxia()
			.use('/admin', admin)
			.get('/', ({ reply }) => reply(200, 'home'));
		expect((await app.request('/admin/missing')).status).toBe(401);
		expect((await app.request('/missing')).status).toBe(404);
		const through = await app.request('/admin/missing', {
			headers: { 'x-admin': '1' },
		});
		expect(through.status).toBe(404);
	});

	test('a trailing slash is the path without it, as the router reads it', async () => {
		const app = alxia()
			.use('/admin/*', admin)
			.get('/:section/*', ({ reply }) => reply(200, 'served'));
		expect((await app.request('/admin/')).status).toBe(200);
		expect((await app.request('/admin/x/')).status).toBe(401);
	});
});
