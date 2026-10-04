/** Writes a template's project, its dependencies moved to the registry's newest. */
import { mkdir } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { NAME, type Template } from './args';
import type { Io } from './io';
import { bumpDependencies, type Manifest, registryUrl } from './registry';
import { packageName } from './target';
import { apiFiles, apiManifest } from './templates/api';
import { alxiaLayer, scaffoldCommand } from './templates/react-router';
import type { AlxiaPackage } from './versions';

/** Writes the project into `target`; throws on a scaffold that changed. */
export async function write(
	target: string,
	template: Template,
	alxia: Record<AlxiaPackage, string>,
	io: Io,
): Promise<true> {
	let manifest: Manifest;
	let files: Record<string, string>;
	if (template === 'api') {
		manifest = apiManifest(packageName(target), alxia);
		files = apiFiles(packageName(target));
	} else {
		await mkdir(dirname(target), { recursive: true });
		const code = await io.run(
			[process.execPath, 'x', ...scaffoldCommand(basename(target))],
			dirname(target),
		);
		if (code !== 0) {
			throw new Error(`create-react-router exited with ${code}.`);
		}
		({ manifest, files } = await alxiaLayer(target, alxia));
	}

	io.out('Resolving the newest versions alxia accepts...');
	const bumped = await bumpDependencies(
		manifest,
		{ url: registryUrl(io.env), ...(io.fetch ? { fetch: io.fetch } : {}) },
		new Set(Object.keys(alxia)),
	);
	for (const line of bumped.moved) io.out(`  ${line}`);
	for (const line of [...bumped.held, ...bumped.unmatched]) io.out(`  ${line}`);
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
