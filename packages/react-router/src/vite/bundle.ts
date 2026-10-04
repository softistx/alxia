/**
 * The server build, self-contained: every dependency bundled into
 * `build/server/index.js`, so that running it needs `build/` and Bun, and
 * no `node_modules`. A Docker image's final stage copies `build/` alone.
 */
import type { EnvironmentOptions } from 'vite';
import { bunEnvironment } from './bun';

/**
 * What the plugin adds to the `ssr` environment under `react-router build`,
 * given its options as the config and the plugins left them:
 * `resolve.noExternal: true`, every package bundled. Never in dev, where
 * Vite's SSR runner loads the packages from `node_modules`.
 *
 * What the app set wins:
 *
 * - `ssr.external: ['sharp']`, or the same on `environments.ssr.resolve`,
 *   keeps those packages external, imported from `node_modules` at
 *   runtime: Vite reads `external` before `noExternal`. Bun's own modules,
 *   `bun` and `bun:*`, and Node's are builtins, external whatever this says.
 * - `ssr.external: true` keeps every package external, Vite's own default:
 *   the plugin adds nothing then.
 * - `ssr.noExternal`, a list, is a subset of everything: it changes nothing.
 *
 * React Router's own plugin reads `noExternal: true` and adds no externals
 * of its own; it runs after this one, which is `enforce: 'pre'`.
 */
export function bundledEnvironment(
	options: EnvironmentOptions,
): EnvironmentOptions | undefined {
	if (options.resolve?.external === true) return undefined;
	return { resolve: { noExternal: true } };
}

/**
 * Everything the plugin adds to the `ssr` environment: built for Bun under
 * either command, and self-contained under `build` alone. In dev, Vite's
 * SSR runner loads the packages from `node_modules`.
 */
export function ssrEnvironment(
	options: EnvironmentOptions,
	command: 'build' | 'serve',
): EnvironmentOptions {
	const added = bunEnvironment(options);
	const bundled = command === 'build' ? bundledEnvironment(options) : undefined;
	if (bundled === undefined) return added;
	return { ...added, resolve: { ...added.resolve, ...bundled.resolve } };
}
