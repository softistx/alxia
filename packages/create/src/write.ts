/** Writes a template's project, its dependencies moved to the registry's newest. */

import { join } from 'node:path';
import { NAME, type Template } from './args';
import { copyTemplate } from './copy';
import type { Io } from './io';
import { bumpDependencies, registryUrl } from './registry';
import { packageName } from './target';
import type { AlxiaPackage } from './versions';

/** Writes the project into `target`. */
export async function write(
	target: string,
	template: Template,
	alxia: Record<AlxiaPackage, string>,
	io: Io,
): Promise<true> {
	const { manifest, files } = await copyTemplate(
		template,
		packageName(target),
		alxia,
	);

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

	for (const [file, content] of Object.entries(files)) {
		await Bun.write(join(target, file), content);
	}
	await Bun.write(
		join(target, 'package.json'),
		`${JSON.stringify(manifest, null, 2)}\n`,
	);
	return true;
}
