#!/usr/bin/env bun
/**
 * Writes `packages/create/templates/react-router/` again from React Router's
 * official scaffold, then adds alxia's layer — the same three edits
 * `examples/react-router` made: `@alxia/core` and `@alxia/react-router` in
 * the dependencies (as `workspace:^`, which `@alxia/create` replaces with
 * the versions it was published beside), `start` running the build on Bun,
 * `alxia()` after `reactRouter()` in `vite.config.ts`; plus
 * `examples/react-router`'s `bunfig.toml`. Two files are stored under
 * another name, since `bun publish` leaves them out of a tarball:
 * `.gitignore` as `gitignore`, `bunfig.toml` as `_bunfig.toml`.
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

type Manifest = {
	scripts: Record<string, string>;
	dependencies: Record<string, string>;
	[key: string]: unknown;
};

/** The manifest with alxia's packages in, sorted, and `start` on Bun. */
export function addAlxia(manifest: Manifest): Manifest {
	if (manifest.scripts['start'] === undefined) {
		throw new Error('package.json: expected a start script');
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
		scripts: { ...manifest.scripts, start: 'bun build/server/index.js' },
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
		const manifest = addAlxia(await Bun.file(join(out, 'package.json')).json());
		const config = addPlugin(
			await Bun.file(join(out, 'vite.config.ts')).text(),
		);
		await Bun.write(
			join(out, 'package.json'),
			`${JSON.stringify(manifest, null, 2)}\n`,
		);
		await Bun.write(join(out, 'vite.config.ts'), config);
		await Bun.write(
			join(out, '_bunfig.toml'),
			Bun.file(join(ROOT, 'examples/react-router/bunfig.toml')),
		);
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
