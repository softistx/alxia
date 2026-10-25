import { describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const DIST = resolve(import.meta.dir, '../../dist');

/**
 * The relative chunks `entry` reaches (itself included) and every package
 * specifier they import.
 */
async function walk(entry: string, seen = new Set<string>()) {
	const specifiers: string[] = [];
	if (seen.has(entry)) return { files: seen, specifiers };
	seen.add(entry);
	const transpiler = new Bun.Transpiler({ loader: 'js' });
	for (const { path } of transpiler.scanImports(await Bun.file(entry).text())) {
		if (path.startsWith('.')) {
			specifiers.push(
				...(await walk(join(dirname(entry), path), seen)).specifiers,
			);
		} else {
			specifiers.push(path);
		}
	}
	return { files: seen, specifiers };
}

const importsOf = async (entry: string) => (await walk(entry)).specifiers;
const filesOf = async (entry: string) => (await walk(entry)).files;

describe('/pwa', () => {
	test('imports nothing: no package, no node: module, no bun', async () => {
		expect(await importsOf(join(DIST, 'pwa/index.js'))).toEqual([]);
	});
});

describe('/pwa/react', () => {
	test('imports react alone: no core, no node: module, no bun', async () => {
		const imports = await importsOf(join(DIST, 'pwa/react/index.js'));
		expect([...new Set(imports)]).toEqual(['react']);
	});

	test('shares no chunk with the main entry, so a page never loads core for it', async () => {
		const react = await filesOf(join(DIST, 'pwa/react/index.js'));
		const main = await filesOf(join(DIST, 'index.js'));
		expect([...react].filter((file) => main.has(file))).toEqual([]);
	});
});

describe('/pwa/server', () => {
	test('imports @alxia/core alone: no react, no node: module, no bun', async () => {
		const imports = await importsOf(join(DIST, 'pwa/server/index.js'));
		expect([...new Set(imports)]).toEqual(['@alxia/core']);
	});
});

describe('a service worker bundle', () => {
	test('bundles the worker-side exports without the page-side code', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'pwa-worker-'));
		try {
			const entry = join(dir, 'worker.ts');
			await writeFile(
				entry,
				`import {
	cachingFor, defineWorkerContract, isStorable, OFFLINE_URL, SKIP_WAITING,
} from ${JSON.stringify(join(DIST, 'pwa/index.js'))};
const contract = defineWorkerContract({ cachePrefix: 'probe' });
self.addEventListener('message', (e: any) => {
	if (e.data?.type === SKIP_WAITING) console.log(OFFLINE_URL, contract.cacheNames);
});
self.addEventListener('fetch', (e: any) => {
	console.log(cachingFor(e.request, location.origin, { contract }), isStorable);
});
`,
			);
			const result = await Bun.build({
				entrypoints: [entry],
				target: 'browser',
				format: 'iife',
			});
			expect(result.success).toBe(true);
			const code = await result.outputs[0]!.text();
			expect(code).toContain('probe');
			for (const page of [
				'sessionStorage',
				'visibilitychange',
				'alxia.update-later',
			]) {
				expect(code).not.toContain(page);
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});

describe('/pwa types', () => {
	test('compile under the WebWorker lib: no DOM-only type', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'pwa-types-'));
		try {
			await writeFile(
				join(dir, 'probe.ts'),
				`import * as pwa from ${JSON.stringify(join(DIST, 'pwa/index'))};\nexport default pwa;\n`,
			);
			const tsc = resolve(import.meta.dir, '../../../../node_modules/.bin/tsc');
			await writeFile(
				join(dir, 'tsconfig.json'),
				JSON.stringify({
					compilerOptions: {
						noEmit: true,
						strict: true,
						skipLibCheck: false,
						target: 'ES2022',
						module: 'ESNext',
						moduleResolution: 'bundler',
						lib: ['ES2022', 'WebWorker'],
						types: [],
					},
					files: ['probe.ts'],
				}),
			);
			const run = Bun.spawn([tsc, '-p', dir], {
				stdout: 'pipe',
				stderr: 'pipe',
			});
			const output = await new Response(run.stdout).text();
			expect(output).toBe('');
			expect(await run.exited).toBe(0);
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
	});
});
