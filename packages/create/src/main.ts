/**
 * The `create-alxia` command: its arguments or answers, the project it
 * writes, what it prints, and its exit code. `index.ts` runs it on the
 * process's own streams; a spec runs it on its own.
 */
import { stat } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import {
	isTemplate,
	NAME,
	parseArgs,
	TEMPLATE_LIST,
	type Template,
} from './args';
import type { Io } from './io';
import { clean, refusal } from './target';
import { alxiaRanges } from './versions';
import { write } from './write';

export { NAME } from './args';
export type { Io } from './io';
export { processIo } from './io';
export { packageName, refusal } from './target';

export const USAGE = `Usage: bun create @alxia [dir] [options]

Writes a new alxia app in dir, which must be empty or not exist yet. Asks
for what is not given.

Options:
  -t, --template <name>  minimal       one route and its test: try alxia in 30 seconds
                         api           spec first: openapi.yaml, generated operations, Zod
                         graphql       a GraphQL API, schema first, on GraphQL Yoga
                         react-router  React Router's official template, served by alxia
  --no-install           write the files, skip bun install
  -h, --help             show this help`;

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
		io.err(`${NAME}: cancelled, nothing written.`);
		return 1;
	}
	if (dir === undefined) {
		io.err(
			`${NAME}: no directory given, and no terminal to ask in.\n\n${USAGE}`,
		);
		return 1;
	}
	const template = options.template ?? askTemplate(io);
	if (template === null) {
		io.err(`${NAME}: cancelled, nothing written.`);
		return 1;
	}
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
	const made = await alxiaRanges()
		.then((alxia) => write(target, template, alxia, io))
		.catch(async (error) => {
			// The directory was empty or absent: what is in it now is ours.
			await clean(target, existed);
			io.err(
				`${NAME}: failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return false;
		});
	if (!made) return 1;

	let installed = true;
	if (options.install) {
		io.out('\nInstalling dependencies with bun install...');
		installed = (await io.run([process.execPath, 'install'], target)) === 0;
		if (!installed)
			io.err(`${NAME}: bun install failed; the files are written.`);
	}
	io.out(
		done(relative(cwd, target) || '.', template, options.install && installed),
	);
	return installed ? 0 : 1;
}

/** The last thing printed: what was written, and the commands to run next. */
function done(where: string, template: Template, installed: boolean): string {
	const steps = [
		where === '.' ? undefined : `cd ${where}`,
		installed ? undefined : 'bun install',
		'bun dev',
	].filter((step) => step !== undefined);
	return `\nDone: ${where === '.' ? 'this directory' : where} holds the ${template} template. Next:\n\n${steps
		.map((step) => `  ${step}`)
		.join('\n')}\n`;
}

/** The template answered; null when cancelled. */
function askTemplate(io: Io): Template | { error: string } | null {
	const answer = io.ask(`Which template? ${TEMPLATE_LIST}`, 'minimal');
	if (answer === null) return null;
	if (answer === undefined) {
		return { error: 'no --template given, and no terminal to ask in.' };
	}
	return isTemplate(answer)
		? answer
		: { error: `unknown template ${answer}: use ${TEMPLATE_LIST}.` };
}
