#!/usr/bin/env bun
/**
 * Writes `packages/create/templates/react-router/` again from React Router's
 * official scaffold, then adds alxia's layer — the same three edits
 * `examples/react-router` made: `@alxia/core` and `@alxia/react-router` in
 * the dependencies (as `workspace:^`, which `@alxia/create` replaces with
 * the versions it was published beside), `dev` under
 * `NODE_ENV=development` (alxia's dev switch), `start` running the build on Bun,
 * `alxia()` after `reactRouter()` in `vite.config.ts`; plus
 * `examples/react-router`'s `bunfig.toml`, and its `Dockerfile` in place of
 * the scaffold's, which builds and runs the app on Node; and its
 * `README.md`'s commands on Bun, the package manager alxia uses (`toBun`).
 * Then Biome, as the `api` template has it (`templates/biome.ts`): `@biomejs/biome`
 * pinned at the workspace's version, the `lint`, `format`, `check`,
 * `check:ci` and `verify` scripts, `BIOME_CONFIG` as `biome.json`, the
 * `api` template's `.vscode/`, a Lint and format section in the README
 * (`addLintSection`), and one `biome check --write` over the
 * whole scaffold, which formats `app.css` and sorts two imports.
 * Three files are stored under another name: `.gitignore` as `gitignore`
 * and `bunfig.toml` as `_bunfig.toml`, since `bun publish` leaves them out
 * of a tarball, and `biome.json` as `_biome.json`, since a `biome.json`
 * inside this workspace without `"root": false` is an error to its Biome.
 * `@alxia/create` renames them back when it copies the template.
 *
 * Run it when React Router ships a new major, once `@alxia/react-router`'s
 * peer range accepts it, then read the diff:
 *
 *   bun scripts/regenerate-react-router-template.ts
 *
 * It refuses a scaffold whose `vite.config.ts` or scripts it does not
 * recognise, writing nothing. `react-router.spec.ts` in `packages/create`
 * then checks the result against `examples/react-router`.
 */
import { mkdtemp, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import {
	addBiome,
	addLintSection,
	BIOME_CONFIG,
	biomeVersion,
} from './templates/biome';

const ROOT = join(import.meta.dir, '..');
const TEMPLATE = join(ROOT, 'packages/create/templates/react-router');
const IMPORT = 'import { alxia } from "@alxia/react-router/vite";\n';

/** `vite.config.ts` with `alxia()` after its one `reactRouter()`. */
export function addPlugin(config: string): string {
	if ((config.match(/\breactRouter\(\)/g) ?? []).length !== 1) {
		throw new Error('vite.config.ts: expected reactRouter() exactly once');
	}
	return IMPORT + config.replace(/\breactRouter\(\)/, 'reactRouter(), alxia()');
}

/** The commands of another package manager, which `toBun` leaves none of. */
export const OTHER_MANAGER = /(^|[\s`(])(npm|npx|pnpm|yarn) /m;

/**
 * The scaffold's `README.md` with Bun's commands for npm's: `bun install`,
 * `bun dev`, `bun run <script>`, `bunx`, `bun.lock`, and `start` running
 * the build on Bun. Refuses a README that still names another package
 * manager's command after that, so a new one is read before it ships.
 */
export function toBun(readme: string): string {
	const bun = readme
		.replace(/^.*package-lock\.json.*$/m, '├── bun.lock')
		.replace(
			"If you're familiar with deploying Node applications, the built-in app server is production-ready.",
			'The build is production-ready and self-contained: `bun run start` runs `build/server/index.js` on Bun, with every dependency bundled into it, so `build/` needs no `node_modules`.',
		)
		.replaceAll('npm install', 'bun install')
		.replaceAll('npm run dev', 'bun dev')
		.replace(/\bnpm run /g, 'bun run ')
		.replace(/\bnpx /g, 'bunx ');
	const left = bun.match(OTHER_MANAGER);
	if (left !== null) {
		throw new Error(
			`README.md: a ${left[2]} command toBun does not know is left: ${bun.split('\n').find((line) => OTHER_MANAGER.test(line))}`,
		);
	}
	return bun;
}

type Manifest = {
	scripts: Record<string, string>;
	dependencies: Record<string, string>;
	devDependencies?: Record<string, string>;
	[key: string]: unknown;
};

/** The manifest with alxia's packages in, sorted, `dev` in development and `start` on Bun. */
export function addAlxia(manifest: Manifest): Manifest {
	if (
		manifest.scripts['dev'] !== 'react-router dev' ||
		manifest.scripts['build'] !== 'react-router build' ||
		manifest.scripts['start'] === undefined ||
		manifest.dependencies['react-router'] === undefined
	) {
		throw new Error(
			'package.json: expected react-router in its dependencies, and the scripts dev: react-router dev, build: react-router build and a start',
		);
	}
	const dependencies = Object.fromEntries(
		Object.entries({
			...manifest.dependencies,
			'@alxia/core': 'workspace:^',
			'@alxia/react-router': 'workspace:^',
		}).sort(([a], [b]) => (a < b ? -1 : 1)),
	);
	return {
		...manifest,
		scripts: {
			...manifest.scripts,
			dev: 'NODE_ENV=development react-router dev',
			start: 'NODE_ENV=production bun build/server/index.js',
		},
		dependencies,
	};
}

async function main(): Promise<void> {
	const work = await mkdtemp(join(tmpdir(), 'alxia-rr-template-'));
	try {
		const out = join(work, 'my-app');
		// Run beside it, by its name: given a path, the scaffold names the
		// package after the whole path.
		await $`bunx create-react-router@latest my-app --yes --no-install --no-git-init --no-agent-skills --no-motion`.cwd(
			work,
		);
		const manifest = addBiome(
			addAlxia(await Bun.file(join(out, 'package.json')).json()),
			await biomeVersion(ROOT),
		);
		const config = addPlugin(
			await Bun.file(join(out, 'vite.config.ts')).text(),
		);
		await Bun.write(
			join(out, 'package.json'),
			`${JSON.stringify(manifest, null, 2)}\n`,
		);
		await Bun.write(join(out, 'vite.config.ts'), config);
		await Bun.write(
			join(out, 'README.md'),
			addLintSection(toBun(await Bun.file(join(out, 'README.md')).text())),
		);
		await Bun.write(
			join(out, '_bunfig.toml'),
			Bun.file(join(ROOT, 'examples/react-router/bunfig.toml')),
		);
		await Bun.write(
			join(out, 'Dockerfile'),
			Bun.file(join(ROOT, 'examples/react-router/Dockerfile')),
		);
		await Bun.write(
			join(out, 'biome.json'),
			`${JSON.stringify(BIOME_CONFIG, null, 2)}\n`,
		);
		await $`cp -R ${join(ROOT, 'packages/create/templates/api/.vscode')} ${out}`;
		// Biome's own formatting of every file, its config included, before
		// the renames: it reads .gitignore.
		await $`${process.execPath} ${join(ROOT, 'node_modules/@biomejs/biome/bin/biome')} check --write`.cwd(
			out,
		);
		await rename(join(out, 'biome.json'), join(out, '_biome.json'));
		await rename(join(out, '.gitignore'), join(out, 'gitignore'));
		await rm(TEMPLATE, { recursive: true, force: true });
		await $`cp -R ${out} ${TEMPLATE}`;
		console.log(
			`Wrote ${TEMPLATE}. Read the diff: git diff --stat -- ${TEMPLATE}`,
		);
	} finally {
		await rm(work, { recursive: true, force: true });
	}
}

if (import.meta.main) await main();
