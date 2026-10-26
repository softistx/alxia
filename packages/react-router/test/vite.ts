/**
 * Vite and the built server, for the `/vite` specs: Vite's dev server and
 * its preview in process on a copy of the fixture, `react-router build` on
 * one, and `bun build/server/index.js` on a free port.
 */
import { join } from 'node:path';
import { $ } from 'bun';
import { createServer, type InlineConfig, preview } from 'vite';
import { copyFixture } from './fixture';

export type Fixture = Awaited<ReturnType<typeof copyFixture>>;

/**
 * Vite's dev server on a copy of the fixture, in this process, on a free port.
 *
 * Vite's own config files are ignored by its watcher: a test writes one just
 * before the server starts, and the file system event of that write can reach
 * the watcher after it started. Vite takes it for an edit of its config and
 * restarts the server, which starts React Router's typegen watcher a second
 * time on a root the test is about to remove.
 */
export async function devServer(
	root: string,
	{ server: serverOptions, ...config }: InlineConfig = {},
) {
	const server = await createServer({
		root,
		configFile: join(root, 'vite.alxia.config.ts'),
		logLevel: 'silent',
		...config,
		server: {
			port: 0,
			host: '127.0.0.1',
			...serverOptions,
			watch: {
				...serverOptions?.watch,
				ignored: ['**/vite*.config.ts'],
			},
		},
	});
	await server.listen();
	const address = server.httpServer?.address();
	if (address === null || typeof address !== 'object') {
		throw new Error('Vite did not listen');
	}
	return { server, base: `http://127.0.0.1:${address.port}` };
}

/** A Vite config beside the fixture's, edited by `edit`. React Router's plugin insists on a file. */
export async function configFile(
	root: string,
	name: string,
	edit: (source: string) => string,
): Promise<string> {
	const file = join(root, `vite.${name}.config.ts`);
	await Bun.write(
		file,
		edit(await Bun.file(join(root, 'vite.alxia.config.ts')).text()),
	);
	return file;
}

/**
 * A dev server on a copy of the fixture of its own, with a Vite config edited
 * by `edit`. React Router's typegen watcher empties and rewrites
 * `.react-router/types` of its root when it starts, so two dev servers on one
 * root race on those files; `close` closes the server, which awaits the
 * watcher, and only then removes the copy.
 */
export async function isolatedServer(
	edit: (source: string, root: string) => string,
	prepare: (root: string) => Promise<void> = async () => {},
) {
	const fixture = await copyFixture();
	try {
		await prepare(fixture.root);
		const config = await configFile(fixture.root, 'isolated', (source) =>
			edit(source, fixture.root),
		);
		const { server, base } = await devServer(fixture.root, {
			configFile: config,
		});
		return {
			base,
			close: async () => {
				try {
					await server.close();
				} finally {
					await fixture.remove();
				}
			},
		};
	} catch (error) {
		await fixture.remove();
		throw error;
	}
}

/** Polls `check` until it holds, or fails after `ms`. */
export async function eventually(check: () => Promise<boolean>, ms = 5_000) {
	const until = performance.now() + ms;
	while (performance.now() < until) {
		if (await check()) return;
		await Bun.sleep(25);
	}
	throw new Error(`not within ${ms} ms`);
}

/** `react-router build` on a copy of the fixture, with the plugin, or with `config` beside it. */
export async function build(
	root: string,
	config = 'vite.alxia.config.ts',
): Promise<void> {
	const result =
		await $`${process.execPath} --bun react-router build --config ${config}`
			.cwd(root)
			// `bun test` sets NODE_ENV=test, which Vite would build as development.
			.env({ ...process.env, NODE_ENV: 'production' })
			.quiet()
			.nothrow();
	if (result.exitCode !== 0) {
		throw new Error(
			`react-router build failed:\n${result.stdout}\n${result.stderr}`,
		);
	}
}

/** `bun build/server/index.js` on a free port, once it printed `<who> listening on <url>`. */
export async function start(root: string, who: string) {
	const child = Bun.spawn(
		// --no-install, as the image runs it: with no node_modules above it, Bun
		// would fetch a package the build left out instead of failing.
		[
			process.execPath,
			'--no-install',
			join(root, 'build', 'server', 'index.js'),
		],
		{
			cwd: root,
			env: { ...process.env, PORT: '0', HOST: '127.0.0.1' },
			stdout: 'pipe',
			stderr: 'pipe',
		},
	);
	const reader = child.stdout.getReader();
	let out = '';
	const pattern = new RegExp(`${who} listening on (\\S+)`);
	for (;;) {
		const { done, value } = await reader.read();
		if (done) {
			child.kill();
			throw new Error(`index.js exited: ${out}`);
		}
		out += new TextDecoder().decode(value);
		const url = out.match(pattern)?.[1];
		if (url !== undefined) {
			reader.releaseLock();
			return { child, url };
		}
	}
}

/** Vite's preview server on a copy of the fixture, in this process, on a free port. */
export async function previewServer(root: string) {
	const server = await preview({
		root,
		configFile: join(root, 'vite.alxia.config.ts'),
		logLevel: 'silent',
		preview: { port: 0, host: '127.0.0.1' },
	});
	const address = server.httpServer.address();
	if (address === null || typeof address !== 'object') {
		throw new Error('Vite did not listen');
	}
	return { server, base: `http://127.0.0.1:${address.port}` };
}
