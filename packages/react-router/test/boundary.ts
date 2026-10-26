import { dirname, join, resolve } from 'node:path';

/** The package's built output, which the boundary specs read. */
export const DIST = resolve(import.meta.dir, '../dist');

/**
 * The relative chunks `entry` reaches (itself included) and every package
 * specifier they import.
 */
export async function walk(entry: string, seen = new Set<string>()) {
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

export const importsOf = async (entry: string) =>
	(await walk(entry)).specifiers;
export const filesOf = async (entry: string) => (await walk(entry)).files;
