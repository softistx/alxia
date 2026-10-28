import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { alxia } from '@alxia/core';
import { AN_HOUR, IMMUTABLE, serveClient } from './assets';

const dirs: string[] = [];
function client(files: Record<string, string | Buffer>): string {
	const dir = mkdtempSync(join(tmpdir(), 'alxia-rr-client-'));
	dirs.push(dir);
	mkdirSync(join(dir, 'assets'));
	for (const [name, body] of Object.entries(files)) {
		writeFileSync(join(dir, name), body);
	}
	return dir;
}
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe('serveClient', () => {
	test('a public file whose name a URL encodes is served at its encoded path', async () => {
		const app = alxia();
		serveClient(app, client({ 'my file.txt': 'spaced', 'café.txt': 'accent' }));
		const spaced = await app.request('/my%20file.txt');
		expect(spaced.status).toBe(200);
		expect(await spaced.text()).toBe('spaced');
		expect(spaced.headers.get('cache-control')).toBe(AN_HOUR);
		const accent = await app.request('/caf%C3%A9.txt');
		expect(await accent.text()).toBe('accent');
	});

	test('a name no route can carry is refused, naming the file', () => {
		const dir = client({ 'a:b.txt': 'colon' });
		expect(() => serveClient(alxia(), dir)).toThrow(
			`reactRouter(): ${join(dir, 'a:b.txt')} cannot be served at a path of its own name; rename it.`,
		);
	});

	describe('precompressed copies', () => {
		const js = 'export const answer = 42;\n'.repeat(200);
		const files = {
			'assets/app-1a2b3c.js': js,
			'assets/app-1a2b3c.js.br': brotliCompressSync(js),
			'assets/app-1a2b3c.js.gz': gzipSync(js),
			'sprite.svg': `<svg>${'<path/>'.repeat(300)}</svg>`,
			'sprite.svg.br': brotliCompressSync('br sprite'),
		};
		const get = (app: ReturnType<typeof alxia>, path: string, accept: string) =>
			app.request(path, { headers: { 'accept-encoding': accept } });

		test('an asset is served brotli to a client that accepts it, with its immutable cache', async () => {
			const app = alxia();
			serveClient(app, client(files));
			const response = await get(app, '/assets/app-1a2b3c.js', 'br, gzip');
			expect(response.headers.get('content-encoding')).toBe('br');
			expect(response.headers.get('vary')).toContain('Accept-Encoding');
			expect(response.headers.get('cache-control')).toBe(IMMUTABLE);
			expect(response.headers.get('content-type')).toContain('javascript');
			expect(Buffer.from(await response.arrayBuffer())).toEqual(
				brotliCompressSync(js),
			);
		});

		test('gzip when brotli is not accepted, the file itself when neither is', async () => {
			const app = alxia();
			serveClient(app, client(files));
			expect(
				(await get(app, '/assets/app-1a2b3c.js', 'gzip')).headers.get(
					'content-encoding',
				),
			).toBe('gzip');
			const plain = await get(app, '/assets/app-1a2b3c.js', 'identity');
			expect(plain.headers.get('content-encoding')).toBeNull();
			expect(plain.headers.get('vary')).toContain('Accept-Encoding');
			expect(await plain.text()).toBe(js);
		});

		test('a file at the top of the build is served precompressed too', async () => {
			const app = alxia();
			serveClient(app, client(files));
			const response = await get(app, '/sprite.svg', 'br');
			expect(response.status).toBe(200);
			expect(response.headers.get('content-encoding')).toBe('br');
			expect(response.headers.get('content-type')).toContain('svg');
			expect(response.headers.get('cache-control')).toBe(AN_HOUR);
		});

		test('a top-level file with no copy for the coding asked is served as it is', async () => {
			const app = alxia();
			serveClient(app, client(files));
			const response = await get(app, '/sprite.svg', 'gzip');
			expect(response.status).toBe(200);
			expect(response.headers.get('content-encoding')).toBeNull();
			expect(response.headers.get('vary')).toContain('Accept-Encoding');
			expect(await response.text()).toBe(files['sprite.svg']);
			const none = await get(app, '/sprite.svg', 'br');
			expect(Buffer.from(await none.arrayBuffer())).toEqual(
				brotliCompressSync('br sprite'),
			);
		});

		test('precompressed: false serves the files as they are', async () => {
			const app = alxia();
			serveClient(app, client(files), { precompressed: false });
			const asset = await get(app, '/assets/app-1a2b3c.js', 'br, gzip');
			expect(asset.headers.get('content-encoding')).toBeNull();
			expect(await asset.text()).toBe(js);
			const top = await get(app, '/sprite.svg', 'br');
			expect(top.headers.get('content-encoding')).toBeNull();
		});
	});
});
