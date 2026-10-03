/**
 * `@alxia/react-router/vite`: `alxia()`, the Vite plugin that makes alxia
 * the server of a React Router app, under `react-router dev` and in
 * `react-router build`, with or without an `app/server.ts`.
 */
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
// Types only: the plugin runs on whichever Vite the app has, never on a
// copy of this package's own.
import type { Plugin, ResolvedConfig, ViteDevServer } from 'vite';
import { NAME, serverEntry } from './entry';
import { send, toRequest } from './node';

export interface AlxiaOptions {
	/**
	 * The server file, relative to Vite's root: a module whose default export
	 * is `createServer()` from `@alxia/react-router`. By default `server.ts`
	 * in React Router's app directory, `app/server.ts`, when it exists, and
	 * otherwise `createServer()` with no options.
	 */
	readonly entry?: string;
}

/** The server build's input, and in dev the module the requests go to. */
const SERVER = 'virtual:alxia-react-router/server';
const RESOLVED_SERVER = `\0${SERVER}`;
/** The same, when there is no server file: `createServer()` as it is. */
const DEFAULT = `${SERVER}-default`;
const RESOLVED_DEFAULT = `\0${DEFAULT}`;

/** What the plugin reads of React Router's own config. */
interface ReactRouterContext {
	readonly reactRouterConfig: {
		readonly appDirectory: string;
		readonly buildDirectory: string;
		readonly serverBuildFile: string;
		readonly ssr: boolean;
		readonly serverBundles?: unknown;
	};
}

/**
 * The Vite plugin that makes alxia the server of a React Router app,
 * anywhere in `plugins`:
 *
 * ```ts
 * export default defineConfig({ plugins: [alxia(), reactRouter()] });
 * ```
 *
 * - **`react-router dev`**: every request Vite does not answer itself —
 *   pages, data, `/api` — goes to the server, loaded through Vite's SSR
 *   runner. HMR, an edit to the server, and the app's own context keys
 *   work, with no restart.
 * - **`react-router build`**: `build/server/index.js` is the server, with
 *   React Router's build inside it. `bun build/server/index.js` listens on
 *   `PORT` (3000) and `HOST` (`0.0.0.0`); importing it starts nothing.
 *
 * The server is `app/server.ts`'s default export, `createServer()` from
 * `@alxia/react-router`, or without that file `createServer()` as it is.
 */
export function alxia(options: AlxiaOptions = {}): Plugin {
	let config: ResolvedConfig | undefined;
	let enabled = true;

	/** The server file, or `undefined` for the default server. */
	function serverFile(resolved: ResolvedConfig): string | undefined {
		if (options.entry !== undefined) {
			const file = isAbsolute(options.entry)
				? options.entry
				: resolve(resolved.root, options.entry);
			if (!existsSync(file)) {
				throw new Error(
					`${NAME}: the entry ${options.entry} does not exist. Create it, or leave entry out to use app/server.ts, or the default server without it.`,
				);
			}
			return file;
		}
		const file = join(contextOf(resolved).appDirectory, 'server.ts');
		return existsSync(file) ? file : undefined;
	}

	async function serveFromEntry(
		server: ViteDevServer,
		req: Parameters<typeof toRequest>[0],
		res: Parameters<typeof toRequest>[1],
	): Promise<void> {
		// Duck-typed rather than Vite's `isRunnableDevEnvironment`: the app's
		// Vite may be another copy than the one this package would import.
		const runner = (
			server.environments.ssr as
				| { readonly runner?: { readonly import?: unknown } }
				| undefined
		)?.runner;
		if (typeof runner?.import !== 'function') {
			throw new Error(
				`${NAME}: Vite's ssr environment does not run modules in this process, so the server cannot be loaded.`,
			);
		}
		// Chosen on each request: a server file created or deleted while the
		// dev server runs is used from the next one.
		const id = serverFile(server.config) === undefined ? DEFAULT : SERVER;
		const module = (await (runner.import as (id: string) => Promise<unknown>)(
			id,
		)) as { readonly default: { fetch(request: Request): Promise<Response> } };
		await send(res, await module.default.fetch(toRequest(req, res)));
	}

	return {
		name: NAME,
		// Before React Router's plugin, wherever it is listed: its config reads
		// the server build's input from this one's, and its dev middleware,
		// which would render the pages without alxia, comes after this one's.
		enforce: 'pre',
		config(_config, env) {
			if (env.command !== 'build') return;
			// One file, `build/server/index.js`: the server and React Router's
			// build together. Rolldown, under Vite 8, names the option otherwise.
			// Vite 7's types know neither `rolldownVersion` nor `rolldownOptions`.
			const meta = this.meta as { readonly rolldownVersion?: string };
			const bundler =
				meta.rolldownVersion === undefined
					? {
							rollupOptions: {
								input: SERVER,
								output: { inlineDynamicImports: true },
							},
						}
					: {
							rolldownOptions: {
								input: SERVER,
								output: { codeSplitting: false },
							},
						};
			return { environments: { ssr: { build: bundler as never } } };
		},
		configResolved(resolved) {
			config = resolved;
			// React Router compiles route modules in a Vite server of its own,
			// with every plugin but its own: there is nothing to serve there.
			if (isChildCompiler(resolved)) {
				enabled = false;
				return;
			}
			const rr = contextOf(resolved);
			// A single-page app has no server to be.
			enabled = rr.ssr;
			if (enabled && rr.serverBundles !== undefined) {
				throw new Error(
					`${NAME}: serverBundles splits React Router's server build in several, and alxia serves one. Remove serverBundles from react-router.config.ts.`,
				);
			}
		},
		resolveId(id) {
			if (id === SERVER) return RESOLVED_SERVER;
			if (id === DEFAULT) return RESOLVED_DEFAULT;
			return undefined;
		},
		load(id) {
			if (id !== RESOLVED_SERVER && id !== RESOLVED_DEFAULT) return;
			if (config === undefined || !enabled) return;
			const dev = config.command === 'serve';
			const file = id === RESOLVED_DEFAULT ? undefined : serverFile(config);
			return serverEntry({
				file,
				label: file === undefined ? '' : relative(config.root, file),
				dev,
				client: dev ? undefined : clientPath(config),
			});
		},
		configureServer(server) {
			if (!enabled) return;
			// After Vite's own middlewares: what Vite leaves is the app's.
			return () => {
				server.middlewares.use((req, res, next) => {
					serveFromEntry(server, req, res).catch((error: unknown) => {
						if (error instanceof Error) server.ssrFixStacktrace(error);
						next(error);
					});
				});
			};
		},
	};
}

/** React Router's config, which its plugin puts on Vite's. */
function contextOf(config: object): ReactRouterContext['reactRouterConfig'] {
	const context = (
		config as { readonly __reactRouterPluginContext?: ReactRouterContext }
	).__reactRouterPluginContext;
	if (context === undefined) {
		throw new Error(
			`${NAME}: React Router's Vite plugin is not in this config. Add reactRouter() from @react-router/dev/vite beside alxia() in vite.config.ts.`,
		);
	}
	return context.reactRouterConfig;
}

/** `build/client`, relative to the built `build/server/index.js`. */
function clientPath(config: ResolvedConfig): string {
	const rr = contextOf(config);
	const outDir = resolve(
		config.root,
		config.environments['ssr']?.build.outDir ??
			join(rr.buildDirectory, 'server'),
	);
	const built = dirname(join(outDir, rr.serverBuildFile));
	const path = relative(built, join(rr.buildDirectory, 'client'));
	return path.startsWith('.') ? path : `./${path}`;
}

/** React Router's child compiler: a Vite server without its plugin, cached apart. */
function isChildCompiler(config: ResolvedConfig): boolean {
	return (
		(config as { readonly __reactRouterPluginContext?: unknown })
			.__reactRouterPluginContext === undefined &&
		config.cacheDir.endsWith('.vite-child-compiler')
	);
}
