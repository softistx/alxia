/**
 * `@alxia/react-router/vite`: one server entry — a module whose default
 * export is the alxia app — for `react-router dev` and `react-router build`.
 */
import { isAbsolute, resolve } from 'node:path';
import {
	isRunnableDevEnvironment,
	type Plugin,
	type ViteDevServer,
} from 'vite';
import { send, toRequest } from './node';
import { serveScript } from './serve';

export interface AlxiaServerOptions {
	/**
	 * The server entry, relative to Vite's root: a module whose default
	 * export is the alxia app, with `reactRouter()` on it. `app/server.ts`
	 * by default.
	 */
	readonly entry?: string;
}

/** What the entry's default export must be: anything with an app's `fetch`. */
interface Served {
	readonly fetch: (request: Request) => Promise<Response>;
}

const NAME = 'alxia-react-router';

/** React Router's server build, as its Vite plugin serves it. */
const SERVER_BUILD = 'virtual:react-router/server-build';

/** The server build's input: the entry's app, and React Router's build. */
const SERVER = 'virtual:alxia-react-router/server';
const RESOLVED_SERVER = `\0${SERVER}`;

/**
 * The Vite plugin that makes an alxia app the server of a React Router app.
 * Put it **before** React Router's own:
 *
 * ```ts
 * export default defineConfig({
 *   plugins: [alxiaServer({ entry: 'app/server.ts' }), reactRouter()],
 * });
 * ```
 *
 * - **`react-router dev`**: the entry is loaded through Vite's SSR runner,
 *   and every request Vite does not answer itself — pages, data, `/api` —
 *   goes to its `fetch`. HMR, an edit to the entry, and the app's own
 *   context keys work, with no restart.
 * - **`react-router build`**: the server is built from the entry, so
 *   `build/server/index.js` is the alxia app with React Router's build
 *   inside it, and `build/server/serve.js` imports it and listens on `PORT`
 *   (3000) and `HOST` (`0.0.0.0`).
 */
export function alxiaServer(options: AlxiaServerOptions = {}): Plugin {
	const entry = options.entry ?? 'app/server.ts';
	let root = process.cwd();
	return {
		name: NAME,
		config(config, env) {
			root = resolve(config.root ?? root);
			if (env.command !== 'build') return;
			// One file, `build/server/index.js`: the entry and React Router's
			// build together, so the entry's `import.meta.url` is beside
			// `build/client`, whatever the two share. Rolldown, under Vite 8,
			// names the option otherwise.
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
		configResolved(config) {
			root = config.root;
		},
		resolveId(id) {
			return id === SERVER ? RESOLVED_SERVER : undefined;
		},
		load(id) {
			// The server build's input: the app as its default export, and what a
			// server build exports beside it, which React Router reads back to
			// prerender. The entry's other exports stay out of it.
			if (id !== RESOLVED_SERVER) return;
			return [
				`export { default } from ${JSON.stringify(entryPath(root, entry))};`,
				`export * from '${SERVER_BUILD}';`,
				'',
			].join('\n');
		},
		generateBundle(_options, bundle) {
			if (this.environment.name !== 'ssr') return;
			const main = Object.values(bundle).find(
				(output) => output.type === 'chunk' && output.isEntry,
			);
			if (main === undefined) return;
			this.emitFile({
				type: 'asset',
				fileName: 'serve.js',
				source: serveScript(main.fileName),
			});
		},
		configureServer(server) {
			// Run after Vite's own middlewares, and before React Router's,
			// which this plugin precedes: what Vite leaves is the app's.
			return () => {
				server.middlewares.use((req, res, next) => {
					serveFromEntry(server, entry, req, res).catch((error: unknown) => {
						if (error instanceof Error) server.ssrFixStacktrace(error);
						next(error);
					});
				});
			};
		},
	};
}

async function serveFromEntry(
	server: ViteDevServer,
	entry: string,
	req: Parameters<typeof toRequest>[0],
	res: Parameters<typeof toRequest>[1],
): Promise<void> {
	const ssr = server.environments.ssr;
	if (ssr === undefined || !isRunnableDevEnvironment(ssr)) {
		throw new Error(
			`${NAME}: Vite's ssr environment does not run modules in this process, so ${entry} cannot be loaded.`,
		);
	}
	const module = (await ssr.runner.import(
		entryPath(server.config.root, entry),
	)) as { readonly default?: Partial<Served> };
	const app = module.default;
	if (typeof app?.fetch !== 'function') {
		throw new TypeError(
			`${NAME}: ${entry} must export the alxia app as its default export: export default app.`,
		);
	}
	await send(res, await app.fetch(toRequest(req, res)));
}

function entryPath(root: string, entry: string): string {
	return isAbsolute(entry) ? entry : resolve(root, entry);
}
