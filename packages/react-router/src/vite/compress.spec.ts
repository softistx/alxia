import { afterAll, describe, expect, test } from 'bun:test';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { precompressClient } from './compress';

const dirs: string[] = [];
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

function build(): string {
	const dir = mkdtempSync(join(tmpdir(), 'alxia-rr-compress-'));
	dirs.push(dir);
	mkdirSync(join(dir, 'assets'));
	writeFileSync(join(dir, 'assets/app.js'), 'const a = 1;\n'.repeat(500));
	writeFileSync(join(dir, 'assets/app.css'), 'a{color:red}\n'.repeat(200));
	writeFileSync(join(dir, 'tiny.js'), 'x');
	writeFileSync(join(dir, 'photo.png'), Buffer.alloc(5000, 7));
	return dir;
}

describe('precompressClient', () => {
	test('writes brotli and gzip copies that decode to the file', async () => {
		const dir = build();
		const done = await precompressClient(dir);
		const js = readFileSync(join(dir, 'assets/app.js'));
		expect(
			brotliDecompressSync(readFileSync(join(dir, 'assets/app.js.br'))),
		).toEqual(js);
		expect(gunzipSync(readFileSync(join(dir, 'assets/app.js.gz')))).toEqual(js);
		expect(existsSync(join(dir, 'assets/app.css.br'))).toBe(true);
		expect(done.files).toBe(2);
		expect(done.brotliBytes).toBeLessThan(done.bytes);
	});

	test('leaves out a file under the threshold and one that is not text', async () => {
		const dir = build();
		await precompressClient(dir);
		expect(existsSync(join(dir, 'tiny.js.br'))).toBe(false);
		expect(existsSync(join(dir, 'photo.png.br'))).toBe(false);
	});

	test('minSize moves the threshold', async () => {
		const dir = build();
		await precompressClient(dir, { minSize: 1 });
		expect(existsSync(join(dir, 'tiny.js.br'))).toBe(false); // larger than its copy
		expect(existsSync(join(dir, 'assets/app.js.gz'))).toBe(true);
	});

	test('does not compress its own copies on a second run', async () => {
		const dir = build();
		await precompressClient(dir);
		await precompressClient(dir);
		expect(existsSync(join(dir, 'assets/app.js.br.br'))).toBe(false);
	});

	test('removes a stale copy it does not replace', async () => {
		const dir = build();
		writeFileSync(join(dir, 'tiny.js.br'), 'stale');
		await precompressClient(dir, { minSize: 1 });
		expect(existsSync(join(dir, 'tiny.js.br'))).toBe(false);
	});
});
