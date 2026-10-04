/** Writes a template's project, its dependencies moved to the registry's newest. */

import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAME, type Template } from './args';
import type { Io } from './io';
import { bumpDependencies, type Manifest, registryUrl } from './registry';
import { packageName } from './target';
import { apiFiles, apiManifest } from './templates/api';
import { reactRouterTemplate } from './templates/react-router';
import type { AlxiaPackage } from './versions';

/**
 * The `react-router` template's files, beside `src/` here and beside
 * `dist/` published: this module is bundled into `dist/index.js`, as
 * `versions.ts` reads `../package.json`.
 */
const REACT_ROUTER = fileURLToPath(
	new URL('../templates/react-router', import.meta.url),
);

/** Writes the project into `target`. */
export async function write(
	target: string,
	template: Template,
	alxia: Record<AlxiaPackage, string>,
	io: Io,
): Promise<true> {
	const name = packageName(target);
	let manifest: Manifest;
	let files: Record<string, string | Blob>;
	if (template === 'api') {
		manifest = apiManifest(name, alxia);
		files = apiFiles(name);
	} else {
		({ manifest, files } = await reactRouterTemplate(
			REACT_ROUTER,
			name,
			alxia,
		));
	}

	io.out('Resolving the newest versions alxia accepts...');
	const bumped = await bumpDependencies(
		manifest,
		{ url: registryUrl(io.env), ...(io.fetch ? { fetch: io.fetch } : {}) },
		alxia,
	);
	for (const line of bumped.moved) io.out(`  ${line}`);
	for (const line of [...bumped.held, ...bumped.unmatched, ...bumped.behind])
		io.out(`  ${line}`);
	if (bumped.failed.length > 0) {
		io.err(
			`${NAME}: warning: the registry did not answer for ${bumped.failed.join(', ')}; ` +
				'kept the versions the template ships.',
		);
	}

	files['package.json'] = `${JSON.stringify(manifest, null, 2)}\n`;
	for (const [file, content] of Object.entries(files)) {
		await Bun.write(join(target, file), content);
	}
	return true;
}
