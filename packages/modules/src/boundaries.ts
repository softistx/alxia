import { dirname, relative, resolve } from 'node:path';
import { Glob } from 'bun';
import type { Module } from './module';

export interface BoundaryViolation {
	file: string;
	imported: string;
	rule: string;
}

export interface BoundaryOptions {
	// The folder `srcGlob` is relative to. Default: the working directory.
	root?: string;
	// The folder holding one folder per module, relative to `root`. Default:
	// the glob's literal prefix (`src/modules/` for `src/modules/**/*.ts`).
	modulesDir?: string;
	// The one file (or folder) of a module another may import, without
	// extension. Default: `public`.
	surface?: string;
}

// Import specifiers of a source text, type-only imports and re-exports
// included (they couple the files too).
export function importsOf(text: string): string[] {
	const found = new Set<string>();
	const patterns = [
		/\b(?:import|export)\b[^;'"]*?\bfrom\s*["']([^"']+)["']/g,
		/\bimport\s*["']([^"']+)["']/g,
		/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
	];
	for (const pattern of patterns) {
		for (const match of text.matchAll(pattern)) found.add(match[1] as string);
	}
	return [...found];
}

function prefixOf(srcGlob: string): string {
	const cut = srcGlob.search(/[*?[{]/);
	const literal = cut === -1 ? srcGlob : srcGlob.slice(0, cut);
	return literal.endsWith('/')
		? literal
		: literal.slice(0, literal.lastIndexOf('/') + 1);
}

// The violations in `files` (absolute path to source text): a file of a
// module that imports another module's file other than its surface, or that
// imports its surface without naming it in `dependsOn`. Files outside a
// registered module's folder are infrastructure and are not checked; spec
// files are skipped. Only relative imports are followed.
export function boundaryViolations(
	files: Record<string, string>,
	registry: readonly Module[],
	options: Required<Pick<BoundaryOptions, 'surface'>> & { modulesRoot: string },
): BoundaryViolation[] {
	const names = new Set(registry.map((module) => module.name));
	const dependsOn = new Map(
		registry.map((module) => [module.name, module.dependsOn ?? []] as const),
	);
	const moduleOf = (path: string) => {
		const [first] = relative(options.modulesRoot, path).split('/');
		return first && !first.startsWith('..') && names.has(first)
			? first
			: undefined;
	};
	const found: BoundaryViolation[] = [];
	for (const [file, text] of Object.entries(files)) {
		if (/\.(spec|test)\.[cm]?[jt]sx?$/.test(file)) continue;
		const from = moduleOf(file);
		if (!from) continue;
		for (const specifier of importsOf(text)) {
			if (!specifier.startsWith('.')) continue;
			const target = resolve(dirname(file), specifier);
			const to = moduleOf(target);
			if (!to || to === from) continue;
			const rest = relative(resolve(options.modulesRoot, to), target);
			const surface = options.surface;
			if (
				rest !== '' &&
				rest !== surface &&
				rest !== `${surface}.ts` &&
				rest !== `${surface}/index`
			) {
				found.push({
					file,
					imported: specifier,
					rule: `only via ${surface}.ts`,
				});
			} else if (!dependsOn.get(from)?.includes(to)) {
				found.push({ file, imported: specifier, rule: 'not in dependsOn' });
			}
		}
	}
	return found;
}

// A test helper: reads the files `srcGlob` matches and throws an `Error`
// listing every violation. Call it from a spec of the application.
export async function assertBoundaries(
	registry: readonly Module[],
	srcGlob: string,
	options: BoundaryOptions = {},
): Promise<void> {
	const root = resolve(options.root ?? process.cwd());
	const modulesRoot = resolve(root, options.modulesDir ?? prefixOf(srcGlob));
	const files: Record<string, string> = {};
	for await (const path of new Glob(srcGlob).scan({ cwd: root })) {
		const absolute = resolve(root, path);
		files[absolute] = await Bun.file(absolute).text();
	}
	const found = boundaryViolations(files, registry, {
		modulesRoot,
		surface: options.surface ?? 'public',
	});
	if (found.length > 0) {
		const lines = found.map(
			(v) => `  ${relative(root, v.file)} imports "${v.imported}": ${v.rule}`,
		);
		throw new Error(`module boundaries broken:\n${lines.join('\n')}`);
	}
}
