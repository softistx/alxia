/**
 * The client build's compressed copies: `app.js.br` and `app.js.gz` beside
 * every compressible file, which `app.static(…, { precompressed })` serves
 * to a browser that accepts them, so the server never compresses on a request.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, constants, gzip } from 'node:zlib';

const brotli = promisify(brotliCompress);
const deflate = promisify(gzip);

/** What compresses well: text, and the formats built on it. */
const COMPRESSIBLE = new Set([
	'.js',
	'.mjs',
	'.cjs',
	'.css',
	'.html',
	'.htm',
	'.svg',
	'.json',
	'.map',
	'.txt',
	'.xml',
	'.webmanifest',
	'.wasm',
	'.ico',
	'.ttf',
	'.otf',
	'.eot',
]);

export interface PrecompressOptions {
	/** The smallest file, in bytes, that gets copies: 1024 by default. */
	readonly minSize?: number;
}

export interface Precompressed {
	/** The files that got copies. */
	readonly files: number;
	/** Their size before, and the size of their brotli copies. */
	readonly bytes: number;
	readonly brotliBytes: number;
}

async function* walk(dir: string): AsyncGenerator<string> {
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) yield* walk(path);
		else if (entry.isFile()) yield path;
	}
}

/**
 * Writes `<file>.br` and `<file>.gz` beside each compressible file of
 * `client` of at least `minSize` bytes, whichever is smaller than the file
 * itself. Brotli at its best quality: it runs once, at build time.
 */
export async function precompressClient(
	client: string,
	options: PrecompressOptions = {},
): Promise<Precompressed> {
	const minSize = options.minSize ?? 1024;
	let files = 0;
	let bytes = 0;
	let brotliBytes = 0;
	for await (const path of walk(client)) {
		if (!COMPRESSIBLE.has(extname(path).toLowerCase())) continue;
		const body = await readFile(path);
		if (body.length < minSize) continue;
		const [br, gz] = await Promise.all([
			brotli(body, {
				params: {
					[constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
					[constants.BROTLI_PARAM_SIZE_HINT]: body.length,
				},
			}),
			deflate(body, { level: 9 }),
		]);
		let written = false;
		if (br.length < body.length) {
			await writeFile(`${path}.br`, br);
			written = true;
		}
		if (gz.length < body.length) {
			await writeFile(`${path}.gz`, gz);
			written = true;
		}
		if (!written) continue;
		files += 1;
		bytes += body.length;
		brotliBytes += Math.min(br.length, body.length);
	}
	return { files, bytes, brotliBytes };
}
