/**
 * What the plugin reads of Vite's and React Router's config: the server
 * file, the client folder, and the server build's bundler options.
 */
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import type { ResolvedConfig } from 'vite';
import { NAME } from './entry';

/** The server build's input, and in dev the module the requests go to. */
export const SERVER = 'virtual:alxia-react-router/server';
/** The same, when there is no server file: `createServer()` as it is. */
export const DEFAULT = `${SERVER}-default`;

/** What the plugin reads of React Router's own config. */
export interface ReactRouterConfig {
	readonly appDirectory: string;
	readonly buildDirectory: string;
	readonly serverBuildFile: string;
	readonly ssr: boolean;
	readonly serverBundles?: unknown;
}

/** React Router's config, which its plugin puts on Vite's. */
export function contextOf(config: object): ReactRouterConfig {
	const context = (
		config as {
			readonly __reactRouterPluginContext?: {
				readonly reactRouterConfig: ReactRouterConfig;
			};
		}
	).__reactRouterPluginContext;
	if (context === undefined) {
		throw new Error(
			`${NAME}: React Router's Vite plugin is not in this config. Add reactRouter() from @react-router/dev/vite beside alxia() in vite.config.ts.`,
		);
	}
	return context.reactRouterConfig;
}

/** React Router's child compiler: a Vite server without its plugin, cached apart. */
export function isChildCompiler(config: ResolvedConfig): boolean {
	return (
		(config as { readonly __reactRouterPluginContext?: unknown })
			.__reactRouterPluginContext === undefined &&
		config.cacheDir.endsWith('.vite-child-compiler')
	);
}

/**
 * The server file: `entry`, which must exist, or `app/server.ts` when it
 * does, or `undefined` for the default server.
 */
export function serverFile(
	entry: string | undefined,
	config: ResolvedConfig,
): string | undefined {
	if (entry !== undefined) {
		const file = isAbsolute(entry) ? entry : resolve(config.root, entry);
		if (!existsSync(file)) {
			throw new Error(
				`${NAME}: the entry ${entry} does not exist. Create it, or leave entry out to use app/server.ts, or the default server without it.`,
			);
		}
		return file;
	}
	const file = join(contextOf(config).appDirectory, 'server.ts');
	return existsSync(file) ? file : undefined;
}

/** `build/client`, relative to the built `build/server/index.js`. */
export function clientPath(config: ResolvedConfig): string {
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

/**
 * The ssr build's options: one file, `build/server/index.js`, the server
 * and React Router's build together. Rolldown, under Vite 8, names the
 * option otherwise.
 */
export function serverBuildOptions(rolldown: boolean): object {
	return rolldown
		? {
				rolldownOptions: {
					input: SERVER,
					output: { codeSplitting: false },
				},
			}
		: {
				rollupOptions: {
					input: SERVER,
					output: { inlineDynamicImports: true },
				},
			};
}
