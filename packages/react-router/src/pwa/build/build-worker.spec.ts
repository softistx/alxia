import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { CLIENT, fixtureBuild } from '../../../test/fixture';
import { parseBrowserManifest, precacheList } from '../model/precache-list';
import { buildWorker } from './build-worker';

const DIST = resolve(import.meta.dir, '../../../dist');
/** Measured at 29.7 kB for the fixture's worker; the limit is about 25 % above. */
const BUDGET = 37_000;

let dir: string;
let client: string;

const worker = (extra: Record<string, unknown> = {}) =>
	buildWorker({ file: 'worker.ts', root: dir, ...extra });

beforeAll(async () => {
	await fixtureBuild();
	dir = await mkdtemp(join(tmpdir(), 'pwa-build-'));
	client = join(dir, 'build/client');
	await mkdir(join(dir, 'build'), { recursive: true });
	await cp(CLIENT, client, { recursive: true });
	await writeFile(join(client, 'offline.html'), '<h1>offline</h1>');
	await writeFile(join(client, 'assets/body-latin-abcdefgh.woff2'), 'font');
	await writeFile(
		join(dir, 'worker.ts'),
		`import { defineWorkerContract } from ${JSON.stringify(join(DIST, 'pwa/index.js'))};
import { startWorker } from ${JSON.stringify(join(DIST, 'pwa/worker/index.js'))};
startWorker({ contract: defineWorkerContract({ cachePrefix: 'fixture' }) });
`,
	);
}, 120_000);

afterAll(() => rm(dir, { recursive: true, force: true }));

describe('buildWorker', () => {
	test('writes service-worker.js with the offline page first, revisioned', async () => {
		const built = await worker();
		expect(built.file).toBe(join(client, 'service-worker.js'));
		expect(built.precache[0]?.url).toBe('/offline.html');
		expect(built.precache[0]?.revision).toMatch(/^[0-9a-f]{16}$/);
		expect(built.precacheBytes).toBeGreaterThan(0);
		expect(await Bun.file(built.file).exists()).toBe(true);
	});

	test("carries every route's code, no page-side code, and stays within budget", async () => {
		const built = await worker();
		const code = await Bun.file(built.file).text();
		const files = await readdir(join(client, 'assets'));
		const manifest = files.find((f) => /^manifest-[\w-]+\.js$/.test(f)) ?? '';
		const urls = precacheList(
			parseBrowserManifest(
				await Bun.file(join(client, 'assets', manifest)).text(),
			),
		).map(({ url }) => url);
		expect(urls.length).toBeGreaterThan(0);
		for (const url of urls) expect(code).toContain(url);
		for (const page of [
			'Symbol.for("react.',
			'sessionStorage',
			': no middleware is given',
			'__ALXIA_PRECACHE__',
		]) {
			expect(code).not.toContain(page);
		}
		console.log(`buildWorker bytes: ${built.bytes}`);
		expect(built.bytes).toBeLessThan(BUDGET);
	});

	test('precaches the files precacheAssets matches', async () => {
		const built = await worker({
			precacheAssets: /^body-latin-[\w-]{8}\.woff2$/,
		});
		expect(built.precache.map(({ url }) => url)).toContain(
			'/assets/body-latin-abcdefgh.woff2',
		);
	});

	test('writes where the contract says', async () => {
		const built = await worker({
			contract: { serviceWorkerUrl: '/sw.js', offlineUrl: '/offline.html' },
		});
		expect(built.file).toBe(join(client, 'sw.js'));
	});

	test('offline: false needs no offline page', async () => {
		const other = join(dir, 'other');
		await cp(client, other, { recursive: true });
		await rm(join(other, 'offline.html'));
		const built = await worker({ client: 'other', offline: false });
		expect(built.precache.some(({ url }) => url === '/offline.html')).toBe(
			false,
		);
	});

	test('names a missing offline page', async () => {
		const other = join(dir, 'no-offline');
		await cp(client, other, { recursive: true });
		await rm(join(other, 'offline.html'));
		await expect(worker({ client: 'no-offline' })).rejects.toThrow(
			'buildWorker(): no-offline/offline.html does not exist. Add public/offline.html, or pass offline: false.',
		);
	});

	test('names a missing manifest and a missing file', async () => {
		await mkdir(join(dir, 'empty/assets'), { recursive: true });
		await expect(worker({ client: 'empty' })).rejects.toThrow(
			'expected one React Router browser manifest',
		);
		await expect(worker({ file: 'nope.ts' })).rejects.toThrow(
			'buildWorker(): nope.ts does not exist.',
		);
	});

	test('names a bundle that fails', async () => {
		await writeFile(join(dir, 'broken.ts'), "import 'does-not-exist-pkg';\n");
		await expect(worker({ file: 'broken.ts' })).rejects.toThrow(
			'buildWorker(): Bun.build failed:',
		);
	});
});
