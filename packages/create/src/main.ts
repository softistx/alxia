/**
 * The `create-alxia` command: its arguments or answers, the project it
 * writes, what it prints, and its exit code. `index.ts` runs it on the
 * process's own streams; a spec runs it on its own.
 */
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { isTemplate, parseArgs, TEMPLATES, type Template } from './args';
import { bumpDependencies, type Manifest, registryUrl } from './registry';
import { apiFiles, apiManifest } from './templates/api';
import {
	alxiaLayer,
	ScaffoldChanged,
	scaffoldCommand,
} from './templates/react-router';
import { type AlxiaPackage, alxiaRanges } from './versions';

export const NAME = 'create-alxia';

export const USAGE = `Usage: bun create @alxia [dir] [options]

Writes a new alxia app in dir, which must be empty or not exist yet. Asks
for what is not given.

Options:
  --template <name>  api           an alxia app with Zod, a spec and the typed client
                     react-router  React Router's official template, served by alxia
  --no-install       write the files, skip bun install
  --help             show this help`;

/** Where the command prints, asks and runs: the process's own, or a spec's. */
export interface Io {
	readonly out: (line: string) => void;
	readonly err: (line: string) => void;
	/** An answer to `question`, `fallback` when empty; null when there is no terminal. */
	readonly ask: (question: string, fallback: string) => string | null;
	/** Runs a command in `cwd` with the terminal's streams; its exit code. */
	readonly run: (command: readonly string[], cwd: string) => Promise<number>;
	readonly env: Record<string, string | undefined>;
	/** The registry's `fetch`, for a spec's fake one. */
	readonly fetch?: (request: Request) => Promise<Response>;
}

/** The process's own `Io`: its streams, `prompt()`, `Bun.spawn`. */
export function processIo(): Io {
	return {
		out: (line) => console.log(line),
		err: (line) => console.error(line),
		ask: (question, fallback) => {
			if (!process.stdin.isTTY) return null;
			const answer = prompt(`${question} (${fallback})`);
			return answer === null ? null : answer.trim() || fallback;
		},
		run: async (command, cwd) =>
			Bun.spawn([...command], { cwd, stdio: ['inherit', 'inherit', 'inherit'] })
				.exited,
		env: process.env,
	};
}

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
	const entries = await readdir(target);
	if (entries.length === 0) return undefined;
	return (
		`${shown} is not empty (${entries.slice(0, 3).join(', ')}${entries.length > 3 ? ', ...' : ''}), ` +
		'and create-alxia writes only into an empty directory. Choose another directory, or empty this one.'
	);
}

/** Runs the command in `cwd`; resolves to the process's exit code. */
export async function main(
	args: readonly string[],
	cwd: string,
	io: Io,
): Promise<number> {
	const options = parseArgs(args);
	if ('error' in options) {
		io.err(`${NAME}: ${options.error}\n\n${USAGE}`);
		return 1;
	}
	if (options.help) {
		io.out(USAGE);
		return 0;
	}

	const dir =
		options.dir ?? io.ask('Where should the project go?', 'alxia-app');
	if (dir === null) {
		io.err(
			`${NAME}: no directory given, and no terminal to ask in.\n\n${USAGE}`,
		);
		return 1;
	}
	const template = options.template ?? askTemplate(io);
	if (typeof template === 'object') {
		io.err(`${NAME}: ${template.error}\n\n${USAGE}`);
		return 1;
	}

	const target = resolve(cwd, dir);
	const refused = await refusal(target, dir);
	if (refused) {
		io.err(`${NAME}: ${refused}`);
		return 1;
	}

	const existed = (await stat(target).catch(() => undefined)) !== undefined;
	const alxia = await alxiaRanges();
	const made = await write(target, template, alxia, io).catch(async (error) => {
		// The directory was empty or absent: what is in it now is ours.
		await clean(target, existed);
		io.err(
			`${NAME}: ${error instanceof ScaffoldChanged ? '' : 'failed: '}${error instanceof Error ? error.message : String(error)}`,
		);
		return false;
	});
	if (!made) return 1;

	const where = relative(cwd, target) || '.';
	let installed = true;
	if (options.install) {
		io.out('\nInstalling dependencies with bun install...');
		installed = (await io.run([process.execPath, 'install'], target)) === 0;
		if (!installed)
			io.err(`${NAME}: bun install failed; the files are written.`);
	}
	const steps = [
		where === '.' ? undefined : `cd ${where}`,
		options.install && installed ? undefined : 'bun install',
		'bun dev',
	].filter((step) => step !== undefined);
	io.out(
		`\nDone: ${where === '.' ? 'this directory' : where} holds the ${template} template. Next:\n\n${steps
			.map((step) => `  ${step}`)
			.join('\n')}\n`,
	);
	return installed ? 0 : 1;
}

/** Removes what was written: the directory, or what is in the one that was there. */
async function clean(target: string, existed: boolean): Promise<void> {
	if (!existed) {
		await rm(target, { recursive: true, force: true });
		return;
	}
	for (const entry of await readdir(target).catch(() => [])) {
		await rm(join(target, entry), { recursive: true, force: true });
	}
}

function askTemplate(io: Io): Template | { error: string } {
	const answer = io.ask(`Which template? ${TEMPLATES.join(' or ')}`, 'api');
	if (answer === null) {
		return { error: 'no --template given, and no terminal to ask in.' };
	}
	return isTemplate(answer)
		? answer
		: { error: `unknown template ${answer}: use ${TEMPLATES.join(' or ')}.` };
}

/** Writes the project into `target`; throws on a scaffold that changed. */
async function write(
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
	for (const line of bumped.held) io.out(`  ${line}`);
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
