/**
 * `@alxia/react-router/vite`: `alxia()`, the Vite plugin that makes alxia
 * the server of a React Router app, under `react-router dev` and in
 * `react-router build`, with or without an `app/server.ts`.
 */
import { relative } from 'node:path';
// Types only: the plugin runs on whichever Vite the app has, never on a
// copy of this package's own.
import type { Plugin, ResolvedConfig } from 'vite';
import { bunEnvironment } from './bun';
import { bundledEnvironment } from './bundle';
import {
	clientPath,
	contextOf,
	DEFAULT,
	isChildCompiler,
	SERVER,
	serverBuildOptions,
	serverFile,
} from './config';
import { serveDev } from './dev';
import { NAME, PASS_THROUGH, serverEntry } from './entry';
import { servePreview } from './preview';
import { requireBun } from './runtime';

export interface AlxiaOptions {
	/**
	 * The server file, relative to Vite's root: a module whose default export
	 * is `createServer()` from `@alxia/react-router`. By default `server.ts`
	 * in React Router's app directory, `app/server.ts`, when it exists, and
	 * otherwise `createServer()` with no options.
	 */
	readonly entry?: string;
}

const RESOLVED_SERVER = `\0${SERVER}`;
const RESOLVED_DEFAULT = `\0${DEFAULT}`;

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
 *   runner. HMR, an edit to the server, the app's own context keys and
 *   its WebSocket routes work, with no restart.
 * - **`react-router build`**: `build/server/index.js` is the server, with
 *   React Router's build inside it. `bun build/server/index.js` listens on
 *   `PORT` (3000) and `HOST` (`0.0.0.0`); importing it starts nothing.
 * - **`vite preview`**: every request goes to that built server, as it
 *   would answer it; so does React Router's prerendering.
 * - **Built for Bun**: the `ssr` environment resolves packages with the
 *   `bun` export condition, leaves `bun` and `bun:*` external, and targets
 *   `esnext` unless the app set a target. What the app set is kept.
 * - **Self-contained**: `react-router build` bundles every package into
 *   `build/server/index.js` (`ssr.noExternal: true`), so `build/` runs with
 *   no `node_modules`. `ssr.external` keeps the packages it names external,
 *   and `ssr.external: true` all of them.
 *
 * The server is `app/server.ts`'s default export, `createServer()` from
 * `@alxia/react-router`, or without that file `createServer()` as it is.
 */
export function alxia(options: AlxiaOptions = {}): Plugin {
	let config: ResolvedConfig | undefined;
	let enabled = true;

	return {
		name: NAME,
		// Before React Router's plugin, wherever it is listed: its config reads
		// the server build's input from this one's, and its dev middleware,
		// which would render the pages without alxia, comes after this one's.
		enforce: 'pre',
		config(_config, env) {
			if (env.command !== 'build') return;
			// Vite 7's types know neither `rolldownVersion` nor `rolldownOptions`.
			const meta = this.meta as { readonly rolldownVersion?: string };
			const bundler = serverBuildOptions(meta.rolldownVersion !== undefined);
			return { environments: { ssr: { build: bundler as never } } };
		},
		configEnvironment(name, options, env) {
			// After every config hook, React Router's included: the server
			// environment as the app and the plugins left it, built for Bun.
			// An app that chose `ssr.target: 'webworker'` keeps Vite's own.
			if (name !== 'ssr' || env.isSsrTargetWebworker === true) return;
			const added = bunEnvironment(options);
			// Built, the server is self-contained; in dev, Vite's SSR runner
			// loads the packages from node_modules.
			const bundled =
				env.command === 'build' ? bundledEnvironment(options) : undefined;
			if (bundled === undefined) return added;
			return { ...added, resolve: { ...added.resolve, ...bundled.resolve } };
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
			if (config === undefined) return;
			// Disabled, a single-page app: React Router still builds its server
			// build, to render index.html, from this input.
			if (!enabled) return PASS_THROUGH;
			const dev = config.command === 'serve';
			const file =
				id === RESOLVED_DEFAULT ? undefined : serverFile(options.entry, config);
			return serverEntry({
				file,
				label: file === undefined ? '' : relative(config.root, file),
				dev,
				client: dev ? undefined : clientPath(config),
			});
		},
		configureServer(server) {
			if (!enabled) return;
			requireBun('react-router dev');
			return serveDev(server, options.entry);
		},
		configurePreviewServer(server) {
			if (!enabled) return;
			// React Router prerenders through a preview server of its own,
			// resolved as `serve` too: the message cannot tell the two apart.
			requireBun(
				'vite preview, or a react-router build that prerenders,',
				'bun --bun vite preview or bun --bun react-router build',
			);
			// Before Vite's own files: the built server answers every request.
			servePreview(server);
		},
	};
}
