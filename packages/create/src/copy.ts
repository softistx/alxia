/**
 * Copies a template stored under `templates/<template>/`: `minimal`, `api`
 * and `graphql`, alxia's own, and the `react-router` one, React Router's official scaffold
 * with the layer `examples/react-router` adds on top. The files are copied
 * as they are, but for the project's name in place of the template's own
 * (`my-api`, `my-app`, …) wherever a text file names it, as the README's
 * `docker build -t` does; `package.json` is rewritten, with that name and
 * alxia's versions in place of `workspace:^`.
 */
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Template } from './args';
import type { Manifest } from './registry';
import type { AlxiaPackage } from './versions';

/**
 * Where the templates are, beside `src/` here and beside `dist/` published:
 * this module is bundled into `dist/index.js`, as `versions.ts` reads
 * `../package.json`.
 */
export const TEMPLATES = fileURLToPath(
	new URL('../templates', import.meta.url),
);

/**
 * Files a template stores under another name: a published tarball would not
 * hold them — `bun publish`, as `npm publish`, leaves every `.gitignore`
 * out, and Bun leaves `bunfig.toml` out too — or this repository's Biome
 * would refuse them: a `biome.json` with no `"root": false` inside the
 * workspace is a nested root configuration, an error, and the project's
 * own must be a root.
 */
export const RENAMED: Readonly<Record<string, string>> = {
	gitignore: '.gitignore',
	'_bunfig.toml': 'bunfig.toml',
	'_biome.json': 'biome.json',
};

/**
 * `file` with `name` for every whole-word `placeholder` in it, or `file`
 * itself when it names none or is not UTF-8 text, as an icon.
 */
export async function withName(
	file: Blob,
	placeholder: string,
	name: string,
): Promise<Blob> {
	let text: string;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(await file.bytes());
	} catch {
		return file;
	}
	const escaped = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const word = new RegExp(`(?<![\\w-])${escaped}(?![\\w-])`, 'g');
	const named = text.replace(word, () => name);
	return named === text ? file : new Blob([named]);
}

/**
 * `template`, from `root`: its manifest, named `name` with alxia's packages
 * at `alxia`'s ranges, and every other file, by the path it is written at.
 */
export async function copyTemplate(
	template: Template,
	name: string,
	alxia: Record<AlxiaPackage, string>,
	root: string = TEMPLATES,
): Promise<{ manifest: Manifest; files: Record<string, Blob> }> {
	const dir = join(root, template);
	const stored: Manifest = await Bun.file(join(dir, 'package.json')).json();
	const manifest: Manifest = { ...stored, name };
	for (const field of ['dependencies', 'devDependencies'] as const) {
		const deps = stored[field];
		if (deps === undefined) continue;
		manifest[field] = Object.fromEntries(
			Object.entries(deps).map(([pkg, range]) => [
				pkg,
				Object.hasOwn(alxia, pkg) ? alxia[pkg as AlxiaPackage] : range,
			]),
		);
	}
	// A range only the workspace resolves would make the project uninstallable.
	const left = JSON.stringify(manifest).match(/"([^"]+)":"workspace:/);
	if (left) {
		throw new Error(
			`the ${template} template names ${left[1]} at workspace:, which this @alxia/create has no version for`,
		);
	}
	const files: Record<string, Blob> = {};
	for await (const path of new Bun.Glob('**').scan({ cwd: dir, dot: true })) {
		// A Finder file in a local checkout is not the template's.
		if (path === 'package.json' || path.endsWith('.DS_Store')) continue;
		const file = Bun.file(join(dir, path));
		files[RENAMED[path] ?? path] =
			typeof stored['name'] === 'string'
				? await withName(file, stored['name'], name)
				: file;
	}
	return { manifest, files };
}
