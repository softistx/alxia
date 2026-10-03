/**
 * The fixture React Router app, built once per test process with
 * `react-router build`, as an app's own build would be.
 */
import { join } from 'node:path';
import { $ } from 'bun';
import type { ServerBuild } from 'react-router';

export const FIXTURE = join(import.meta.dir, '..', 'fixture');
export const CLIENT = join(FIXTURE, 'build', 'client');

/** Bun's own user agent is a bot to `isbot`, which waits for the whole page: send a browser's. */
export const BROWSER =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

let built: Promise<ServerBuild> | undefined;

/** The fixture's server build, built on first use. */
export function fixtureBuild(): Promise<ServerBuild> {
	built ??= (async () => {
		const result = await $`${process.execPath} --bun react-router build`
			.cwd(FIXTURE)
			.quiet()
			.nothrow();
		if (result.exitCode !== 0) {
			throw new Error(
				`react-router build failed in ${FIXTURE}:\n${result.stdout}\n${result.stderr}`,
			);
		}
		return (await import(
			join(FIXTURE, 'build', 'server', 'index.js')
		)) as ServerBuild;
	})();
	return built;
}
