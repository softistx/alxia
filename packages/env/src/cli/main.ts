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

/** The bin's work, apart from the process, so a spec can run it. */
export async function main(
	args: readonly string[],
	cwd: string,
	io: Io,
): Promise<number> {
	const [command, file = 'src/env.ts', ...rest] = args;
	if (command !== 'example' || rest.length > 0) {
		io.err(USAGE);
		return command === undefined || command === '--help' ? 0 : 1;
	}
	const envs = collect();
	try {
		await import(resolve(cwd, file));
	} catch (error) {
		io.err(`alxia-env: ${file} failed: ${(error as Error).message}`);
		return 1;
	}
	if (envs.length === 0) {
		io.err(`alxia-env: ${file} ran no defineEnv() call`);
		return 1;
	}
	io.out(envs.map(envExample).join('\n').trimEnd());
	return 0;
}
