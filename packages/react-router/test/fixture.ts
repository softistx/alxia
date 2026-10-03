/**
 * The fixture React Router app, built once per test process with
 * `react-router build`, as an app's own build would be.
 */
import { cp, rm } from 'node:fs/promises';
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
			// `bun test` sets NODE_ENV=test, which Vite would build as development.
			.env({ ...process.env, NODE_ENV: 'production' })
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

/**
 * A copy of the fixture the `/vite` specs may edit and build, beside it so
 * that it resolves the same `node_modules`. Removed by `remove`. With
 * `server: false`, the copy has no `app/server.ts`: the plugin's default
 * server serves it.
 */
export async function copyFixture({ server = true } = {}): Promise<{
	readonly root: string;
	readonly remove: () => Promise<void>;
}> {
	const root = join(
		FIXTURE,
		'..',
		`.fixture-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
	);
	await cp(FIXTURE, root, {
		recursive: true,
		filter: (source) => !/[\\/](build|\.react-router)$/.test(source),
	});
	if (!server) await rm(join(root, 'app', 'server.ts'));
	return { root, remove: () => rm(root, { recursive: true, force: true }) };
}
