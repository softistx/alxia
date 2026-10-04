/**
 * The versions a generated project starts from: alxia's own packages at the
 * versions this release of `@alxia/create` was published beside, and the
 * ranges alxia's peers accept, which the registry's newest versions must
 * stay within.
 */
import { dirname } from 'node:path';

/** The `@alxia/*` packages a template depends on. */
export type AlxiaPackage =
	| '@alxia/core'
	| '@alxia/openapi'
	| '@alxia/react-router';

const ALXIA_PACKAGES: readonly AlxiaPackage[] = [
	'@alxia/core',
	'@alxia/openapi',
	'@alxia/react-router',
];

/**
 * The peer ranges of alxia's packages that a template's other dependencies
 * must stay within, by the package they constrain: `typescript` is every
 * package's, `zod` is `@alxia/zod`'s, `react-router` and `vite` are
 * `@alxia/react-router`'s. `versions.spec.ts` checks each against the
 * package that declares it, so a widened peer fails there until it is
 * widened here too.
 */
export const PEER_RANGES = {
	typescript: '^6.0.3 || ^7.0.0',
	zod: '^4.2.0',
	'react-router': '^8.0.0',
	vite: '^7.0.0 || ^8.0.0',
} as const;

/**
 * The range a generated project declares for each `@alxia/*` package: what
 * this package's own `package.json` says. Published, that is `^<version>`,
 * which `bun publish` writes in place of `workspace:^` from the version
 * beside it in the workspace. Inside the workspace, `workspace:^` is
 * resolved the same way, from the sibling's installed `package.json`.
 */
export async function alxiaRanges(
	manifestUrl: URL = new URL('../package.json', import.meta.url),
): Promise<Record<AlxiaPackage, string>> {
	const manifest = await Bun.file(manifestUrl).json();
	const declared: Record<string, string> = manifest.devDependencies ?? {};
	const ranges = {} as Record<AlxiaPackage, string>;
	for (const name of ALXIA_PACKAGES) {
		const range = declared[name];
		if (range === undefined) {
			throw new Error(`@alxia/create: its package.json names no ${name}`);
		}
		ranges[name] = range.startsWith('workspace:')
			? await workspaceRange(name, range, dirname(manifestUrl.pathname))
			: range;
	}
	return ranges;
}

/** `workspace:^` as `bun publish` rewrites it: `^` and the sibling's version. */
async function workspaceRange(
	name: string,
	range: string,
	from: string,
): Promise<string> {
	const file = Bun.resolveSync(`${name}/package.json`, from);
	const { version } = await Bun.file(file).json();
	const prefix = range.slice('workspace:'.length);
	return prefix === '*' ? version : `${prefix}${version}`;
}
