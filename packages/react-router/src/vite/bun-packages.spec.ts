import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ViteDevServer } from 'vite';
import { copyFixture } from '../../test/fixture';
import {
	build,
	configFile,
	devServer,
	type Fixture,
	start,
} from '../../test/vite';

/**
 * Two packages that export a `bun` variant before their default one, as a
 * package written for Bun does: one bundled into the server build, as every
 * package is, one left external by the app's `ssr.external`.
 */
async function addBunPackages(root: string) {
	for (const name of ['bun-inlined', 'bun-external']) {
		const dir = join(root, 'node_modules', name);
		await mkdir(dir, { recursive: true });
		await Bun.write(
			join(dir, 'package.json'),
			JSON.stringify({
				name,
				type: 'module',
				exports: { bun: './bun.js', default: './node.js' },
			}),
		);
		await Bun.write(
			join(dir, 'bun.js'),
			`export const variant = '${name}:bun-variant';\n`,
		);
		await Bun.write(
			join(dir, 'node.js'),
			`export const variant = '${name}:node-variant';\n`,
		);
	}
	// A server importing both, and Bun's own modules.
	await Bun.write(
		join(root, 'app', 'server.ts'),
		`import { createServer } from '@alxia/react-router';
import { file } from 'bun';
import { Database } from 'bun:sqlite';
import { variant as external } from 'bun-external';
import { variant as inlined } from 'bun-inlined';

export default createServer({
	configure: (app) =>
		app.get('/api/bun', async ({ reply }) => {
			const db = new Database(':memory:');
			const row = db.query('select 1 + 1 as two').get() as { two: number };
			db.close();
			return reply.ok({
				inlined,
				external,
				two: row.two,
				exists: await file('no-such-file').exists(),
			});
		}),
	onListen: (listening) => console.log(\`bun listening on \${listening.url}\`),
});
`,
	);
	return configFile(root, 'bun', (source) =>
		source.replace(
			"ssr: { external: ['@alxia/react-router', '@alxia/core'] }",
			"ssr: { external: ['@alxia/react-router', '@alxia/core', 'bun-external'] }",
		),
	);
}

const ANSWER = {
	inlined: 'bun-inlined:bun-variant',
	external: 'bun-external:bun-variant',
	two: 2,
	exists: false,
};

describe('react-router build, for Bun', () => {
	let fixture: Fixture;
	let bundle: string;

	beforeAll(async () => {
		fixture = await copyFixture();
		await addBunPackages(fixture.root);
		await build(fixture.root, 'vite.bun.config.ts');
		bundle = await Bun.file(
			join(fixture.root, 'build', 'server', 'index.js'),
		).text();
	}, 60_000);
	afterAll(async () => {
		await fixture?.remove();
	});

	test("a bundled package's bun variant is the one in build/server/index.js", () => {
		expect(bundle).toContain('bun-inlined:bun-variant');
		expect(bundle).not.toContain('bun-inlined:node-variant');
	});

	test('bun, bun:sqlite and the external package stay imports of the bundle', () => {
		const imports = [
			...bundle.matchAll(/^import\s[^'"]*?from\s*["']([^"']+)["']/gm),
		].map((match) => match[1]);
		expect(imports).toContain('bun');
		expect(imports).toContain('bun:sqlite');
		expect(imports).toContain('bun-external');
	});

	test('bun build/server/index.js answers with both bun variants, SQLite and Bun.file', async () => {
		const { child, url } = await start(fixture.root, 'bun');
		try {
			const response = await fetch(new URL('/api/bun', url));
			expect(response.status).toBe(200);
			expect(await response.json()).toEqual(ANSWER);
		} finally {
			child.kill();
		}
	});
});

describe('react-router dev, for Bun', () => {
	let fixture: Fixture;
	let server: ViteDevServer;
	let base: string;

	beforeAll(async () => {
		fixture = await copyFixture();
		const config = await addBunPackages(fixture.root);
		({ server, base } = await devServer(fixture.root, { configFile: config }));
	}, 30_000);
	afterAll(async () => {
		await server?.close();
		await fixture?.remove();
	});

	test("the SSR runner loads the bun variants and Bun's own modules, as the build does", async () => {
		const response = await fetch(`${base}/api/bun`);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual(ANSWER);
	});
});
