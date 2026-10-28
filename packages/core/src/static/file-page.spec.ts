/** `app.file` and `app.page`: one path served by a file, or by a bundled page. */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alxia } from '../app/alxia';

let root: string;

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'alxia-file-'));
	await writeFile(join(root, 'hello.txt'), 'hello'.repeat(50));
	await writeFile(join(root, 'hello.txt.br'), 'brotli copy');
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe('app.file', () => {
	test('a path, a Blob, or a function', async () => {
		const app = alxia()
			.file('/hello', join(root, 'hello.txt'))
			.file('/robots.txt', new Blob(['User-agent: *'], { type: 'text/plain' }))
			.file('/maybe', ({ request }) =>
				request.headers.get('x-want') === 'yes' ? new Blob(['yes']) : null,
			)
			.file('/missing', join(root, 'nope.txt'));
		expect(await (await app.request('/hello')).text()).toBe('hello'.repeat(50));
		expect(await (await app.request('/robots.txt')).text()).toBe(
			'User-agent: *',
		);
		expect((await app.request('/maybe')).status).toBe(404);
		expect(
			await (
				await app.request('/maybe', { headers: { 'x-want': 'yes' } })
			).text(),
		).toBe('yes');
		expect((await app.request('/missing')).status).toBe(404);
	});
});

describe('app.file, precompressed copies', () => {
	const file = () =>
		alxia().file('/hello', join(root, 'hello.txt'), {
			precompressed: ['br', 'gzip'],
		});
	const get = (accept: string) =>
		file().request('/hello', { headers: { 'accept-encoding': accept } });

	test('the copy a client accepts is served, with Content-Encoding and Vary', async () => {
		const response = await get('br, gzip');
		expect(response.headers.get('content-encoding')).toBe('br');
		expect(response.headers.get('vary')).toContain('Accept-Encoding');
		expect(response.headers.get('content-type')).toContain('text/plain');
		expect(await response.text()).toBe('brotli copy');
	});

	test('no copy for the coding asked, or a client that takes none, gets the file', async () => {
		for (const accept of ['gzip', 'identity']) {
			const response = await get(accept);
			expect(response.headers.get('content-encoding')).toBeNull();
			expect(response.headers.get('vary')).toContain('Accept-Encoding');
			expect(await response.text()).toBe('hello'.repeat(50));
		}
	});

	test('a copy older than its file is not served', async () => {
		const path = join(root, 'changed.txt');
		await writeFile(path, 'old'.repeat(50));
		await writeFile(`${path}.br`, 'old copy');
		const past = new Date(Date.now() - 60_000);
		await utimes(`${path}.br`, past, past);
		const app = alxia().file('/changed', path, { precompressed: ['br'] });
		const response = await app.request('/changed', {
			headers: { 'accept-encoding': 'br' },
		});
		expect(response.headers.get('content-encoding')).toBeNull();
		expect(await response.text()).toBe('old'.repeat(50));
	});

	test('without the option the file varies by nothing', async () => {
		const response = await alxia()
			.file('/hello', join(root, 'hello.txt'))
			.request('/hello', { headers: { 'accept-encoding': 'br' } });
		expect(response.headers.get('content-encoding')).toBeNull();
		expect(response.headers.get('vary')).toBeNull();
	});
});

describe('app.page', () => {
	test('a route at a page, or a page at a route through a group, is refused', async () => {
		const bundle = (await import('../../test/fixtures/page.html')).default;
		expect(() =>
			alxia()
				.page('/x', bundle)
				.get('/x', ({ reply }) => reply(200, 'x')),
		).toThrow('GET /x is already served by a page');
		expect(() =>
			alxia()
				.page('/x', bundle)
				.ws('/x', {}, { message() {} }),
		).toThrow('WS /x is already served by a page');
		expect(() =>
			alxia()
				.get('/g/x', ({ reply }) => reply(200, 'x'))
				.group('/g', (g) => g.page('/x', bundle)),
		).toThrow('page(): /g/x is already served');
		expect(() =>
			alxia()
				.group('/g', (g) => g.page('/x', bundle))
				.get('/g/x', ({ reply }) => reply(200, 'x')),
		).toThrow('GET /g/x is already served by a page');
		expect(() =>
			alxia()
				.page('/y/:id', bundle)
				.get('/y/:name', ({ reply }) => reply(200, 'y')),
		).toThrow('GET /y/:name is already served by a page');
		expect(() =>
			alxia()
				.get('/a/b/x', ({ reply }) => reply(200, 'x'))
				.group('/a', (a) => a.group('/b', (b) => b.page('/x', bundle))),
		).toThrow('page(): /a/b/x is already served');
		expect(() =>
			alxia()
				.page('/x', bundle)
				.plugin(alxia().get('/x', ({ reply }) => reply(200, 'x'))),
		).toThrow('GET /x is already served by a page');
		// A static path beside a parameter is no conflict: Bun serves the page at /x.
		expect(() =>
			alxia()
				.page('/x', bundle)
				.get('/:id', ({ reply }) => reply(200, 'id')),
		).not.toThrow();
		const plugin = alxia().page('/x', bundle);
		expect(() =>
			alxia()
				.get('/x', ({ reply }) => reply(200, 'x'))
				.plugin(plugin),
		).toThrow('page(): /x is already served');
	});
});

describe('app.page, bundled', () => {
	test("Bun's HTML bundle, served by Bun.serve; a path served twice is refused", async () => {
		const bundle = (await import('../../test/fixtures/page.html')).default;
		const app = alxia()
			.get('/api', ({ reply }) => reply(200, 'api'))
			.page('/', bundle);
		expect(() => app.page('/', bundle)).toThrow('already served');
		expect(() => app.page('/api', bundle)).toThrow('already served');
		const server = app.listen({ port: 0 });
		try {
			const page = await fetch(server.url);
			expect(page.headers.get('content-type')).toContain('text/html');
			expect(await page.text()).toContain('<script type="module"');
			expect(await (await fetch(new URL('/api', server.url))).text()).toBe(
				'api',
			);
		} finally {
			await app.stop(true);
		}
	});

	test('a page of a plugin is mounted under its prefix', async () => {
		const bundle = (await import('../../test/fixtures/page.html')).default;
		const app = alxia({ prefix: '/app' }).plugin(alxia().page('/', bundle));
		const server = app.listen({ port: 0 });
		try {
			expect((await fetch(new URL('/app', server.url))).status).toBe(200);
		} finally {
			await app.stop(true);
		}
	});
});
