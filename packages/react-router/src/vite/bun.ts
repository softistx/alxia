/**
 * The server build, for Bun: what the plugin adds to Vite's `ssr`
 * environment so that `build/server/index.js` is built for the runtime
 * that runs it, and so is the module the dev server loads.
 */
import { builtinModules } from 'node:module';
import type { EnvironmentOptions } from 'vite';

/** The export condition Bun resolves a package by, and the plugin adds. */
const BUN_CONDITION = 'bun';

/**
 * Vite's own builtins for a server environment (its `nodeLikeBuiltins`),
 * which it uses when the config names none: Node's modules, `node:*` and
 * `bun:*`. Bare `bun` is among Node's modules only when Vite runs on Bun.
 */
const VITE_BUILTINS: readonly (string | RegExp)[] = [
	...builtinModules.filter((id) => !id.includes(':')),
	/^node:/,
	/^bun:/,
];

/**
 * Vite's default conditions for a server environment, and for its
 * externals, which it uses when the config names none. React Router's
 * plugin always names them; these are for a config where nothing did.
 */
const VITE_CONDITIONS = ['module', 'node', 'development|production'];
const VITE_EXTERNAL_CONDITIONS = ['node', 'module-sync'];

/** Bun's own modules, which no bundler should try to resolve: `bun` and `bun:*`. */
const BUN_BUILTINS: readonly (string | RegExp)[] = [BUN_CONDITION, /^bun:/];

/**
 * What to merge into `present` so that it holds `wanted`: Vite replaces its
 * default with any value set, so an unset option gets the default too.
 * Strings compare by value, patterns by source.
 */
function adding<T extends string | RegExp>(
	present: readonly T[] | undefined,
	fallback: readonly T[],
	wanted: readonly T[],
): T[] {
	const list = present ?? fallback;
	const has = (item: T) =>
		list.some((other) =>
			typeof item === 'string'
				? other === item
				: other instanceof RegExp && other.source === item.source,
		);
	return [
		...(present === undefined ? fallback : []),
		...wanted.filter((item) => !has(item)),
	];
}

/**
 * What the plugin adds to the `ssr` environment, given its options as the
 * config and every plugin's `config` hook left them. Vite merges the
 * result into them, concatenating arrays, so what the app set is kept:
 *
 * - `resolve.conditions` and `resolve.externalConditions` gain `bun`, so a
 *   package that exports a `bun` variant is bundled, and checked, as Bun
 *   would load it. Which variant wins stays the package's own order.
 * - `resolve.builtins` gains `bun` and `bun:*`: left external, whichever
 *   runtime runs Vite. Vite's own builtins are kept when the app names none.
 * - `build.target` is `esnext`, Bun's, unless the app set one, at the top
 *   level or on the environment.
 *
 * `ssr.target` stays `node`: Bun runs Node's modules, and `webworker`
 * would bundle every dependency with the browser's conditions. An app that
 * sets `webworker` itself gets none of this: the plugin leaves that
 * environment to Vite's own defaults.
 */
export function bunEnvironment(
	options: EnvironmentOptions,
): EnvironmentOptions {
	const resolve = options.resolve ?? {};
	const added: EnvironmentOptions = {
		resolve: {
			conditions: adding(resolve.conditions, VITE_CONDITIONS, [BUN_CONDITION]),
			externalConditions: adding(
				resolve.externalConditions,
				VITE_EXTERNAL_CONDITIONS,
				[BUN_CONDITION],
			),
			builtins: adding(resolve.builtins, VITE_BUILTINS, BUN_BUILTINS),
		},
	};
	if (options.build?.target === undefined) {
		added.build = { target: 'esnext' };
	}
	return added;
}
