/**
 * The `alxia-react-router` command: its arguments, what it prints, and its
 * exit code. `index.ts` runs it on the process's own.
 */
import { NAME } from '../vite/entry';
import { reveal } from './reveal';

export const USAGE = `Usage: ${NAME} <command> [options]

Commands:
  reveal [--force]  Write the server alxia() runs by default to app/server.ts,
                    or to alxia({ entry })'s file, to customise it. --force
                    overwrites a file already there.

Options:
  --help            Show this help.`;

/** Where the command prints: the process's streams, or a spec's. */
export interface Output {
	readonly out: (line: string) => void;
	readonly err: (line: string) => void;
}

/** Runs the command in `root`; resolves to the process's exit code. */
export async function main(
	args: readonly string[],
	root: string,
	output: Output,
): Promise<number> {
	const [command, ...options] = args;
	if (command === undefined) {
		output.err(USAGE);
		return 1;
	}
	if (command === '--help' || command === '-h') {
		output.out(USAGE);
		return 0;
	}
	if (command !== 'reveal') {
		output.err(`${NAME}: unknown command ${command}.\n\n${USAGE}`);
		return 1;
	}
	if (options.includes('--help') || options.includes('-h')) {
		output.out(USAGE);
		return 0;
	}
	const unknown = options.find((option) => option !== '--force');
	if (unknown !== undefined) {
		output.err(`${NAME}: unknown option ${unknown} for reveal.\n\n${USAGE}`);
		return 1;
	}
	try {
		const result = await reveal(root, options.includes('--force'));
		if ('exists' in result) {
			output.err(
				`${NAME}: ${result.exists} already exists, and reveal leaves it as it is. Run ${NAME} reveal --force to overwrite it.`,
			);
			return 1;
		}
		output.out(
			`${NAME}: wrote ${result.written}, the server alxia() runs by default.\nNext: uncomment configure in ${result.written} to add the app's hooks and /api; bun run dev picks it up.`,
		);
		return 0;
	} catch (error) {
		output.err(error instanceof Error ? error.message : String(error));
		return 1;
	}
}
