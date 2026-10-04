/**
 * `use(path, guard)` reads the request's path as the router, the static
 * files and React Router do: decoded segment by segment, empty segments
 * collapsed, without case. A path spelled otherwise than the guard's —
 * `%61dmin`, `//admin`, `admin%2Fx`, `ADMIN` — is still guarded.
 */
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alxia } from './alxia';
import { defineMiddleware } from './define-middleware';

const guard = defineMiddleware(({ reply }) =>
	reply(401, { error: 'no' as const }),
);

/** The status of a request built from the raw path, never normalised by `new URL(path, base)`. */
const status = async (
	app: { fetch: (request: Request) => Promise<Response> },
	path: string,
) => (await app.fetch(new Request(`http://localhost${path}`))).status;

describe('use(path, guard), on a path spelled otherwise', () => {
	test('a parameter route: an encoded or case-changed segment', async () => {
		const app = alxia()
			.use('/admin', guard)
			.get('/:section/panel', ({ reply, params }) =>
				reply(200, params.section),
			);
		for (const path of [
			'/admin/panel',
			'/%61dmin/panel',
			'/Admin/panel',
			'//admin/panel',
		]) {
			expect(await status(app, path)).toBe(401);
		}
		expect(await status(app, '/public/panel')).toBe(200);
	});

	test('a catch-all: doubled slashes, an encoded slash, case', async () => {
		const app = alxia()
			.use('/admin', guard)
			.get('/*', ({ reply }) => reply(200, 'page'));
		for (const path of [
			'//admin/x',
			'/admin%2Fx',
			'/admin%2fx',
			'/%61dmin/x',
			'/ADMIN/x',
			'/x/..%2Fadmin/x',
			'/%E0%A4%A/x',
		]) {
			expect(await status(app, path)).toBe(401);
		}
		expect(await status(app, '/administrators')).toBe(200);
		expect(await status(app, '/public%2Fadmin')).toBe(200);
	});

	test('static files: every spelling of a guarded folder', async () => {
		const dir = mkdtempSync(join(tmpdir(), 'alxia-norm-'));
		mkdirSync(join(dir, 'private'));
		writeFileSync(join(dir, 'private', 's.txt'), 'secret');
		writeFileSync(join(dir, 'open.txt'), 'open');
		const app = alxia().use('/files/private', guard).static('/files', dir);
		for (const path of [
			'/files/private/s.txt',
			'/files//private/s.txt',
			'/files/private%2Fs.txt',
			'/files/%70rivate/s.txt',
			'/files/PRIVATE/s.txt',
		]) {
			expect(await status(app, path)).toBe(401);
		}
		expect(await status(app, '/files/open.txt')).toBe(200);
	});

	test('a request no route matches, under the guarded path', async () => {
		const app = alxia()
			.use('/admin', guard)
			.get('/admin/users', ({ reply }) => reply(200, 'users'));
		expect(await status(app, '/%61dmin/missing')).toBe(401);
		expect(await status(app, '/missing')).toBe(404);
	});
});
