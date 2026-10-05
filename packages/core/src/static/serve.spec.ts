import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { alxia } from '../app/alxia';

let root: string;
const big = 'abcdefghijklmnopqrstuvwxyz'.repeat(100);

beforeAll(async () => {
	root = await mkdtemp(join(tmpdir(), 'alxia-static-'));
	await writeFile(join(root, 'hello.txt'), 'hello');
	await writeFile(join(root, 'index.html'), '<h1>app</h1>');
	await writeFile(join(root, 'about.html'), '<h1>about</h1>');
	await writeFile(join(root, 'big.txt'), big);
	await writeFile(join(root, 'empty.txt'), '');
	await writeFile(join(root, 'app.js'), 'console.log(1)');
	await writeFile(join(root, 'app.js.gz'), gzipSync('console.log(1)'));
	await writeFile(join(root, 'module.wasm'), new Uint8Array([0, 97, 115, 109]));
	await writeFile(join(root, '.env'), 'SECRET=1');
	await mkdir(join(root, 'docs'));
	await writeFile(join(root, 'docs', 'index.html'), '<h1>docs</h1>');
});
afterAll(() => rm(root, { recursive: true, force: true }));

/** The app of most specs: every option of `static` on one folder. */
const make = () =>
	alxia().static('/files', root, {
		extensions: ['html'],
		precompressed: ['br', 'gzip'],
		types: { '.wasm': 'application/wasm' },
		cacheControl: (path) =>
			path.endsWith('.js') ? 'public, max-age=31536000, immutable' : 'no-cache',
		headers: (path) =>
			path.endsWith('.txt') ? { 'x-kind': 'text' } : undefined,
	});

describe('app.static', () => {
	test('a file with its type, ETag, Last-Modified, and headers by path', async () => {
		const response = await make().request('/files/hello.txt');
		expect(await response.text()).toBe('hello');
		expect(response.headers.get('content-type')).toContain('text/plain');
		expect(response.headers.get('etag')).toStartWith('W/"');
		expect(response.headers.get('last-modified')).not.toBeNull();
		expect(response.headers.get('cache-control')).toBe('no-cache');
		expect(response.headers.get('x-kind')).toBe('text');
		expect(response.headers.get('accept-ranges')).toBe('bytes');
		expect(response.headers.get('content-length')).toBe('5');
	});

	test('an index, an extension, a content type of its own', async () => {
		const app = make();
		expect(await (await app.request('/files/docs')).text()).toBe(
			'<h1>docs</h1>',
		);
		expect(await (await app.request('/files/')).text()).toBe('<h1>app</h1>');
		expect(await (await app.request('/files/about')).text()).toBe(
			'<h1>about</h1>',
		);
		expect(
			(await app.request('/files/module.wasm')).headers.get('content-type'),
		).toBe('application/wasm');
	});
});

describe('app.static, conditional and ranged', () => {
	test('304 for a client that has it', async () => {
		const app = make();
		const first = await app.request('/files/hello.txt');
		const etag = first.headers.get('etag') ?? '';
		expect(
			(
				await app.request('/files/hello.txt', {
					headers: { 'if-none-match': etag },
				})
			).status,
		).toBe(304);
		const since = first.headers.get('last-modified') ?? '';
		expect(
			(
				await app.request('/files/hello.txt', {
					headers: { 'if-modified-since': since },
				})
			).status,
		).toBe(304);
	});

	test('ranges: 206, a suffix, and 416', async () => {
		const app = make();
		const part = await app.request('/files/big.txt', {
			headers: { range: 'bytes=0-9' },
		});
		expect(part.status).toBe(206);
		expect(await part.text()).toBe('abcdefghij');
		expect(part.headers.get('content-range')).toBe(`bytes 0-9/${big.length}`);
		const tail = await app.request('/files/big.txt', {
			headers: { range: 'bytes=-3' },
		});
		expect(await tail.text()).toBe('xyz');
		const beyond = await app.request('/files/big.txt', {
			headers: { range: `bytes=${big.length}-` },
		});
		expect(beyond.status).toBe(416);
		expect(beyond.headers.get('content-range')).toBe(`bytes */${big.length}`);
		const stale = await app.request('/files/big.txt', {
			headers: { range: 'bytes=0-9', 'if-range': 'W/"old"' },
		});
		expect(stale.status).toBe(200);
	});

	test('an empty file: a suffix range is served whole, any other is a 416', async () => {
		const app = make();
		const suffix = await app.request('/files/empty.txt', {
			headers: { range: 'bytes=-5' },
		});
		expect(suffix.status).toBe(200);
		expect(suffix.headers.get('content-range')).toBeNull();
		expect(await suffix.text()).toBe('');
		for (const method of ['GET', 'HEAD']) {
			const response = await app.request('/files/empty.txt', {
				method,
				headers: { range: 'bytes=0-' },
			});
			expect(response.status).toBe(416);
			expect(response.headers.get('content-range')).toBe('bytes */0');
		}
		const stale = await app.request('/files/empty.txt', {
			headers: { range: 'bytes=0-', 'if-range': 'W/"old"' },
		});
		expect(stale.status).toBe(200);
	});
});

describe('app.static, precompressed copies and headers', () => {
	test('a precompressed file, to a client that accepts it', async () => {
		const app = make();
		const gzip = await app.request('/files/app.js', {
			headers: { 'accept-encoding': 'gzip, br;q=0' },
		});
		expect(gzip.headers.get('content-encoding')).toBe('gzip');
		expect(gzip.headers.get('content-type')).toContain('javascript');
		expect(gzip.headers.get('vary')).toBe('Accept-Encoding');
		expect(gzip.headers.get('cache-control')).toContain('immutable');
		const plain = await app.request('/files/app.js');
		expect(plain.headers.get('content-encoding')).toBeNull();
		expect(await plain.text()).toBe('console.log(1)');
	});

	test('with precompressed copies, the plain file varies by Accept-Encoding too', async () => {
		const plain = await make().request('/files/app.js');
		expect(plain.headers.get('content-encoding')).toBeNull();
		expect(plain.headers.get('vary')).toBe('Accept-Encoding');
		const revalidated = await make().request('/files/app.js', {
			headers: { 'if-none-match': plain.headers.get('etag') ?? '' },
		});
		expect(revalidated.status).toBe(304);
		expect(revalidated.headers.get('vary')).toBe('Accept-Encoding');
		const without = alxia().static('/files', root);
		expect(
			(await without.request('/files/app.js')).headers.get('vary'),
		).toBeNull();
	});

	test("a Vary of the headers option adds to a precompressed file's", async () => {
		const app = alxia().static('/files', root, {
			precompressed: ['gzip'],
			headers: { vary: 'accept-encoding, Origin' },
		});
		const response = await app.request('/files/app.js', {
			headers: { 'accept-encoding': 'gzip' },
		});
		expect(response.headers.get('content-encoding')).toBe('gzip');
		expect(response.headers.get('vary')).toBe('Accept-Encoding, Origin');
	});

	test('each Set-Cookie of the headers option is kept', async () => {
		const headers = new Headers();
		headers.append('set-cookie', 'a=1');
		headers.append('set-cookie', 'b=2');
		const app = alxia().static('/files', root, { headers });
		const response = await app.request('/files/hello.txt');
		expect(response.headers.getSetCookie()).toEqual(['a=1', 'b=2']);
	});
});

describe('app.static, what it does not serve, and its sources', () => {
	test('dotfiles, traversal and missing files are 404s', async () => {
		const app = make();
		for (const path of [
			'/files/.env',
			'/files/../hello.txt',
			'/files/%2e%2e/etc/passwd',
			'/files/a%5C..%5Cb',
			'/files/nope',
		]) {
			expect((await app.request(path)).status).toBe(404);
		}
	});

	test('a fallback serves a single-page app; HEAD sends no body', async () => {
		const spa = alxia().static('/', root, { fallback: 'index.html' });
		const deep = await spa.request('/some/client/route');
		expect(await deep.text()).toBe('<h1>app</h1>');
		const head = await spa.request('/hello.txt', { method: 'HEAD' });
		expect(head.status).toBe(200);
		expect(head.headers.get('content-length')).toBe('5');
		expect(await head.text()).toBe('');
	});

	test('any source: files held in memory', async () => {
		const files = new Map([
			[
				'data.json',
				new File(['{"a":1}'], 'data.json', { type: 'application/json' }),
			],
		]);
		const app = alxia().static('/mem', (path) => files.get(path));
		expect(await (await app.request('/mem/data.json')).json()).toEqual({
			a: 1,
		});
		expect((await app.request('/mem/other.json')).status).toBe(404);
	});

	test('behind the app’s middlewares', async () => {
		const app = alxia()
			.use(async (_ctx, next) => {
				const response = await next();
				response.headers.set('x-hooked', 'yes');
				return response;
			})
			.static('/files', root);
		expect(
			(await app.request('/files/hello.txt')).headers.get('x-hooked'),
		).toBe('yes');
	});
});
