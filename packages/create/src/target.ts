/** The directory a project is written into: its name, whether it may be, and undoing it. */
import { readdir, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

/** A directory name as a package name: lowercased, `-` for the rest. */
export function packageName(dir: string): string {
	const name = basename(dir)
		.toLowerCase()
		.replace(/[^a-z0-9._~-]+/g, '-')
		.replace(/^[._-]+|-+$/g, '');
	return name || 'alxia-app';
}

/** Why `target` cannot take a new project, or undefined when it can. */
export async function refusal(
	target: string,
	shown: string = target,
): Promise<string | undefined> {
	const info = await stat(target).catch(() => undefined);
	if (!info) return undefined;
	if (!info.isDirectory()) return `${shown} exists and is not a directory.`;
	const entries = (await readdir(target)).sort();
	if (entries.length === 0) return undefined;
	return (
		`${shown} is not empty (${entries.slice(0, 3).join(', ')}${entries.length > 3 ? ', ...' : ''}), ` +
		'and create-alxia writes only into an empty directory. Choose another directory, or empty this one.'
	);
}

/** Removes what was written: the directory, or what is in the one that was there. */
export async function clean(target: string, existed: boolean): Promise<void> {
	if (!existed) {
		await rm(target, { recursive: true, force: true });
		return;
	}
	for (const entry of await readdir(target).catch(() => [])) {
		await rm(join(target, entry), { recursive: true, force: true });
	}
}
