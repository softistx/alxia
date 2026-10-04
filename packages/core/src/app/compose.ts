/**
 * How an app takes in the parts it is put together from: a group's routes,
 * declared in a scope of their own, and a plugin's routes and hooks.
 */
import { joinPath } from '../router/paths';
import { type AppState, mount, register } from './app-state';
import { refuseShadowedPages } from './pages';
import { mergeGlobals } from './runtime';
import type { AnyAlxia } from './signatures';

/** A group's build: given the group, it returns it with its routes declared. */
type Build = (group: AnyAlxia) => AnyAlxia;

/** The arguments of `group`: a prefix and a build, or a build alone. */
export type GroupArgs = [prefixOrBuild: string | Build, maybeBuild?: Build];

/**
 * `app.group(prefix?, build)`: the routes `build` declares on a group that
 * starts with every hook in force here and shares this app's global hooks.
 * `open` makes the group's app at its full prefix.
 */
export function group(
	state: AppState,
	[prefixOrBuild, maybeBuild]: GroupArgs,
	open: (prefix: string) => [app: AnyAlxia, state: AppState],
): void {
	const [prefix, build] =
		typeof prefixOrBuild === 'string'
			? [joinPath(state.prefix, prefixOrBuild), maybeBuild]
			: [state.prefix, prefixOrBuild];
	if (build === undefined) throw new TypeError('group(): build is missing');
	const [child, childState] = open(prefix);
	childState.scope = state.scope.copy();
	childState.runtime = {
		...childState.runtime,
		globals: state.runtime.globals,
	};
	const before = new Set(state.runtime.globals.pages.keys());
	const built = build(child);
	refuseShadowedPages(state.runtime, before);
	for (const route of built.routes) register(state, route);
	for (const socket of built.sockets) mount(state, socket);
}

/**
 * The plugin `use` is given, alone: an app, or a function given the app.
 * A function `defineMiddleware` made was read before, as a middleware.
 * `isApp` tells an app.
 */
export function pluginOf(
	args: readonly unknown[],
	isApp: (value: unknown) => value is AnyAlxia,
): AnyAlxia | ((app: AnyAlxia) => AnyAlxia) {
	const [plugin] = args;
	if (args.length === 0) {
		throw new TypeError('use(): nothing is given: a plugin, or middlewares');
	}
	if (args.length !== 1) {
		throw new TypeError(
			'use(): a plugin is given alone; middlewares are made with defineMiddleware()',
		);
	}
	if (isApp(plugin) || typeof plugin === 'function') return plugin as never;
	throw new TypeError(
		"use(): the plugin is neither an app nor a function; a middleware is made with defineMiddleware(), and a hook of defineHook() or defineWrap() goes in a route's list",
	);
}

/**
 * `app.use(plugin)`, an app: its routes under this app's prefix and behind
 * its hooks, its hooks for the routes declared after it, its global hooks.
 */
export function usePlugin(state: AppState, plugin: AppState): void {
	for (const route of plugin.routes) {
		register(
			state,
			state.scope.behind(route, joinPath(state.prefix, route.path)),
		);
	}
	for (const socket of plugin.sockets) {
		mount(
			state,
			state.scope.behind(socket, joinPath(state.prefix, socket.path)),
		);
	}
	state.scope.absorb(plugin.scope, state.prefix);
	mergeGlobals(state.runtime, plugin.runtime.globals, state.prefix);
}
