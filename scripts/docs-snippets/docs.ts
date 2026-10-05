/** Which docs `check:docs` reads, and how strictly. */

import { join, relative } from 'node:path';
import { ROOT } from '../artifacts/packages';

export interface DocToCheck {
	readonly path: string;
	/** An app's docs: every `ts` fence names its file, or is an excerpt or `no-check`. */
	readonly strict: boolean;
}

/** The docs whose fences are an app: the root README, "Start", the recipes. */
function isStrict(path: string): boolean {
	const doc = relative(ROOT, path);
	return (
		doc === 'README.md' ||
		doc === 'docs/start.md' ||
		/^docs\/recipes\/[^/]+\.md$/.test(doc)
	);
}

function scan(pattern: string): string[] {
	return [...new Bun.Glob(pattern).scanSync(ROOT)]
		.filter((doc) => !doc.includes('node_modules'))
		.sort()
		.map((doc) => join(ROOT, doc));
}

/**
 * The docs given, else every doc of the repository: the root README, the
 * root `docs/`, and each package's README and `docs/` (a template's files
 * excepted: `verify:templates` checks those).
 */
export function docsToCheck(given: readonly string[]): DocToCheck[] {
	const paths =
		given.length > 0
			? [...given]
			: [
					join(ROOT, 'README.md'),
					...scan('docs/**/*.md'),
					...scan('packages/*/README.md'),
					...scan('packages/*/docs/**/*.md'),
				];
	return paths.map((path) => ({ path, strict: isStrict(path) }));
}
