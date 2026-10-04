import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveConfig } from 'vite';
import { BROWSER, copyFixture } from '../../test/fixture';
import { build, configFile, type Fixture, start } from '../../test/vite';
import { bundledEnvironment } from './bundle';

const browser = { 'user-agent': BROWSER };
const text = (html: string) => html.replaceAll('<!-- -->', '');

/** The fixture's own externals, which the configs below replace. */
const EXTERNALS = "ssr: { external: ['@alxia/react-router', '@alxia/core'] }";

/**
 * The bare specifiers `bundle` still imports, statement by statement:
 * `import … from 'x'`, `import 'x'` and `export … from 'x'`, minified or
 * not. A `require` or `import()` left in would fail the run below, which
 * starts the server with `--no-install` from `build/` alone.
 */
function bareImports(bundle: string): string[] {
	return [
		...bundle.matchAll(
			/(?:^|;)\s*(?:import|export)\b\s*(?:[^'";]*?\bfrom\s*)?["']([^"'./][^"']*)["']/gm,
		),
	].map((match) => match[1] as string);
}

test('bareImports reads each form, minified or not', () => {
	expect(
		bareImports(
			'import{a}from"x";export*from"y";import"z";\nimport { b } from "./local";\nimport c from "w";',
		).sort(),
	).toEqual(['w', 'x', 'y', 'z']);
});

describe('bundledEnvironment', () => {
	test('bundles every package', () => {
		expect(bundledEnvironment({})).toEqual({ resolve: { noExternal: true } });
	});

	test('an app that lists externals keeps them: Vite reads external first', () => {
		expect(bundledEnvironment({ resolve: { external: ['sharp'] } })).toEqual({
			resolve: { noExternal: true },
		});
	});

	test('ssr.external: true, every package external, adds nothing', () => {
		expect(bundledEnvironment({ resolve: { external: true } })).toBeUndefined();
	});
});

describe('the ssr environment, as Vite resolves it with the plugin', () => {
	let fixture: Fixture;

	beforeAll(async () => {
		fixture = await copyFixture();
	});
	afterAll(async () => {
		await fixture?.remove();
	});

	const ssrOf = async (command: 'build' | 'serve', config?: string) => {
		const resolved = await resolveConfig(
			{
				root: fixture.root,
				configFile: config ?? join(fixture.root, 'vite.alxia.config.ts'),
				logLevel: 'silent',
			},
			command,
			'production',
		);
		const ssr = resolved.environments['ssr'];
		if (ssr === undefined) throw new Error('no ssr environment');
		return ssr;
	};

	test("react-router build: every package bundled, the app's externals kept", async () => {
		const ssr = await ssrOf('build');
		expect(ssr.resolve.noExternal).toBe(true);
		expect(ssr.resolve.external).toEqual([
			'@alxia/react-router',
			'@alxia/core',
		]);
	});

	test("react-router dev: Vite's own, packages loaded from node_modules", async () => {
		const ssr = await ssrOf('serve');
		expect(ssr.resolve.noExternal).not.toBe(true);
	});

	test('ssr.external: true is the app saying every package stays external', async () => {
		const config = await configFile(fixture.root, 'all-external', (source) =>
			source.replace(EXTERNALS, 'ssr: { external: true }'),
		);
		const ssr = await ssrOf('build', config);
		expect(ssr.resolve.noExternal).not.toBe(true);
		expect(ssr.resolve.external).toBe(true);
	});
});

describe('react-router build, self-contained', () => {
	let fixture: Fixture;
	let bundle: string;
	/** build/ alone, outside the repository: no node_modules to resolve from. */
	let alone: string;

	beforeAll(async () => {
		fixture = await copyFixture();
		// Prerendering imports the bundle back: it still must.
		await Bun.write(
			join(fixture.root, 'react-router.config.ts'),
			"import type { Config } from '@react-router/dev/config';\n\nexport default { ssr: true, prerender: ['/login'] } satisfies Config;\n",
		);
		// As an app's own config is: no externals.
		await configFile(fixture.root, 'bundled', (source) =>
			source.replace(
				`\t// See vite.config.ts: these are linked, not installed.\n\t${EXTERNALS},\n`,
				'',
			),
		);
		await build(fixture.root, 'vite.bundled.config.ts');
		bundle = await Bun.file(
			join(fixture.root, 'build', 'server', 'index.js'),
		).text();
		alone = await mkdtemp(join(tmpdir(), 'alxia-bundled-'));
		await cp(join(fixture.root, 'build'), join(alone, 'build'), {
			recursive: true,
		});
	}, 60_000);
	afterAll(async () => {
		await fixture?.remove();
		if (alone !== undefined) await rm(alone, { recursive: true, force: true });
	});

	test("build/server/index.js imports Node's and Bun's modules, and no package", () => {
		const imports = bareImports(bundle);
		expect(imports.length).toBeGreaterThan(0);
		const packages = imports.filter(
			(id) =>
				!builtinModules.includes(id) &&
				!id.startsWith('node:') &&
				id !== 'bun' &&
				!id.startsWith('bun:'),
		);
		expect(packages).toEqual([]);
		// The ones a server build imports when they are external.
		for (const id of ['react', 'react-dom/server', 'react-router', 'isbot']) {
			expect(imports).not.toContain(id);
		}
	});

	test('prerendering still read the bundle back', async () => {
		expect(
			await Bun.file(
				join(fixture.root, 'build', 'client', 'login', 'index.html'),
			).exists(),
		).toBe(true);
	});

	test('build/ copied alone, with no node_modules, serves a page and its assets', async () => {
		const { child, url } = await start(alone, 'fixture');
		try {
			const page = await fetch(url, {
				headers: { ...browser, 'x-user': 'Cy' },
			});
			expect(page.status).toBe(200);
			const html = await page.text();
			expect(text(html)).toContain('<h1>Hello Cy</h1>');
			// One copy of the app's context, set by the server, read by the routes.
			expect(html).toContain('<p id="greeting">from the entry</p>');
			const asset = html.match(/\/assets\/entry\.client-[\w-]+\.js/)?.[0];
			expect(asset).toBeDefined();
			const served = await fetch(new URL(asset as string, url));
			expect(served.status).toBe(200);
		} finally {
			child.kill();
		}
	});
});

describe('react-router build, a package the app keeps external', () => {
	let fixture: Fixture;

	beforeAll(async () => {
		fixture = await copyFixture();
		await configFile(fixture.root, 'isbot', (source) =>
			source.replace(EXTERNALS, "ssr: { external: ['isbot'] }"),
		);
		await build(fixture.root, 'vite.isbot.config.ts');
	}, 60_000);
	afterAll(async () => {
		await fixture?.remove();
	});

	test('stays an import of the bundle, and the rest is bundled', async () => {
		const imports = bareImports(
			await Bun.file(join(fixture.root, 'build', 'server', 'index.js')).text(),
		);
		expect(imports).toContain('isbot');
		expect(imports).not.toContain('react');
		expect(imports).not.toContain('react-router');
	});
});
