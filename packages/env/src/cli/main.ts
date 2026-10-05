import { resolve } from 'node:path';
import { envExample } from '../example';
import { collect } from '../registry';

export interface Io {
	out(line: string): void;
	err(line: string): void;
}

const USAGE = `usage: alxia-env example [module]

Prints a .env.example from the schema of each defineEnv() call that
module runs (src/env.ts by default):
  bunx alxia-env example > .env.example`;

let runs = 0;

/** The bin's work, apart from the process, so a spec can run it. */
export async function main(
	args: readonly string[],
	cwd: string,
	io: Io,
): Promise<number> {
	if (args.includes('--help') || args.includes('-h')) {
		io.out(USAGE);
		return 0;
	}
	const [command, file = 'src/env.ts', ...rest] = args;
	if (command !== 'example' || rest.length > 0) {
		io.err(USAGE);
		return 1;
	}
	const { envs, stop } = collect();
	try {
		// A query, so a second run executes the module again.
		await import(`${resolve(cwd, file)}?alxia-env=${++runs}`);
	} catch (error) {
		io.err(
			`alxia-env: ${file} failed: ${error instanceof Error ? error.message : String(error)}`,
		);
		return 1;
	} finally {
		stop();
	}
	if (envs.length === 0) {
		io.err(`alxia-env: ${file} ran no defineEnv() call`);
		return 1;
	}
	io.out(envs.map(envExample).join('\n').trimEnd());
	return 0;
}
