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

const WORKBOX = [
	'workbox-core',
	'workbox-expiration',
	'workbox-navigation-preload',
	'workbox-precaching',
	'workbox-routing',
	'workbox-strategies',
];

describe('/pwa/build', () => {
	test('imports Node built-ins alone: no package, no workbox, no vite, no react, no core', async () => {
		const imports = await importsOf(join(DIST, 'pwa/build/index.js'));
		expect(imports.length).toBeGreaterThan(0);
		for (const specifier of imports) expect(specifier).toStartWith('node:');
	});

	test('reads the Bun global inside functions, never at load', async () => {
		const source = await Bun.file(join(DIST, 'pwa/build/index.js')).text();
		expect(source).not.toMatch(/^(?:const|let|var) .*\bBun\b/m);
	});
});

describe('/pwa/worker', () => {
	test('imports the six workbox packages alone: no react, no core, no node: module, no bun', async () => {
		const imports = await importsOf(join(DIST, 'pwa/worker/index.js'));
		expect([...new Set(imports)].sort()).toEqual(WORKBOX);
	});

	test('shares with the main entry and the hooks only chunks that import nothing', async () => {
		const worker = await filesOf(join(DIST, 'pwa/worker/index.js'));
		for (const other of ['index.js', 'pwa/react/index.js']) {
			const files = await filesOf(join(DIST, other));
			for (const file of [...worker].filter((f) => files.has(f))) {
				expect(await importsOf(file)).toEqual([]);
			}
		}
	});

	test('its declarations name no workbox type', async () => {
		const files = await filesOf(join(DIST, 'pwa/worker/index.js'));
		for (const file of files) {
			const declaration = file.replace(/\.js$/, '.d.ts');
			if (!(await Bun.file(declaration).exists())) continue;
			expect(await Bun.file(declaration).text()).not.toMatch(
				/from ['"]workbox|import\(['"]workbox/,
			);
		}
	});

	test('a bundle that calls startWorker carries the injected list and no page-side code', async () => {
		const dir = await mkdtemp(join(tmpdir(), 'pwa-start-'));
		try {
			const entry = join(dir, 'worker.ts');
			await writeFile(
				entry,
				`import { defineWorkerContract } from ${JSON.stringify(join(DIST, 'pwa/index.js'))};
import { startWorker } from ${JSON.stringify(join(DIST, 'pwa/worker/index.js'))};
startWorker({ contract: defineWorkerContract({ cachePrefix: 'probe' }) });
`,
			);
			const result = await Bun.build({
				entrypoints: [entry],
				target: 'browser',
				format: 'iife',
				minify: true,
				define: {
					'globalThis.__ALXIA_PRECACHE__':
						'[{"url":"/assets/x-abcdefgh.js","revision":null}]',
					'process.env.NODE_ENV': '"production"',
				},
			});
			expect(result.success).toBe(true);
			const code = (await result.outputs[0]?.text()) ?? '';
			console.log(`startWorker bundle: ${code.length} bytes`);
			expect(code).toContain('/assets/x-abcdefgh.js');
			expect(code).not.toContain('__ALXIA_PRECACHE__');
			for (const page of [
				'sessionStorage',
				'alxia.update-later',
				'Symbol.for("react.',
			]) {
				expect(code).not.toContain(page);
			}
		} finally {
			await rm(dir, { recursive: true, force: true });
		}
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
			const output = result.outputs[0];
			expect(output).toBeDefined();
			const code = (await output?.text()) ?? '';
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
	const probe = async (lib: string[]) => {
		const dir = await mkdtemp(join(tmpdir(), 'pwa-types-'));
		try {
			await writeFile(
				join(dir, 'probe.ts'),
				`import * as pwa from ${JSON.stringify(join(DIST, 'pwa/index'))};
import * as worker from ${JSON.stringify(join(DIST, 'pwa/worker/index'))};
export default [pwa, worker];
`,
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
						lib,
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
	};

	test('compile under the WebWorker lib: no DOM-only type', () =>
		probe(['ES2022', 'WebWorker']));

	test("compile under the app's DOM lib: no WebWorker-only type", () =>
		probe(['ES2022', 'DOM']));
});
