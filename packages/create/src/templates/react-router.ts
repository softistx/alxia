/**
 * The `react-router` template: React Router's official one, as
 * `create-react-router` wrote it, committed under `templates/react-router/`
 * with the layer `examples/react-router` adds on top — `@alxia/core` and
 * `@alxia/react-router` as dependencies, `alxia()` in the Vite plugins,
 * `start` running the build on Bun, and a `bunfig.toml` that starts React
 * Router's CLI on Bun. The files are copied as they are; only `package.json`
 * is rewritten, with the project's name and alxia's versions.
 */
import { join } from 'node:path';
import type { Manifest } from '../registry';
import type { AlxiaPackage } from '../versions';

/**
 * Files the template stores under another name, because a published tarball
 * would not hold them: `bun publish`, as `npm publish`, leaves every
 * `.gitignore` out, and Bun leaves `bunfig.toml` out too.
 */
export const RENAMED: Readonly<Record<string, string>> = {
	gitignore: '.gitignore',
	'_bunfig.toml': 'bunfig.toml',
};

/**
 * The template in `dir`: its manifest, named `name` with alxia's packages at
 * `alxia`'s ranges, and every other file, by the path it is written at.
 */
export async function reactRouterTemplate(
	dir: string,
	name: string,
	alxia: Record<AlxiaPackage, string>,
): Promise<{ manifest: Manifest; files: Record<string, Blob> }> {
	const stored: Manifest = await Bun.file(join(dir, 'package.json')).json();
	const dependencies = { ...stored.dependencies };
	for (const pkg of Object.keys(dependencies)) {
		if (pkg in alxia) dependencies[pkg] = alxia[pkg as AlxiaPackage];
	}
	const manifest: Manifest = { ...stored, name, dependencies };
	const files: Record<string, Blob> = {};
	for await (const path of new Bun.Glob('**').scan({ cwd: dir, dot: true })) {
		if (path === 'package.json') continue;
		files[RENAMED[path] ?? path] = Bun.file(join(dir, path));
	}
	return { manifest, files };
}
