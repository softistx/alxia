/**
 * How an app takes in the parts it is put together from: a group's routes,
 * declared in a scope of their own, and a plugin's routes and hooks.
 */
import { joinPath } from '../router/paths';
import { type AppState, mount, register } from './app-state';
import { useMiddlewares } from './declare-hooks';
import { refuseShadowedPages } from './pages';
import { mergeGlobals } from './runtime';
import type { AnyAlxia } from './signatures';
import { builtinOf } from './validate';

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
 * `app.use(...args)` or `app.plugin(...args)`: middlewares made by
 * `defineMiddleware` — given to `plugin`, the deprecated form of `use` —
 * else a plugin, mounted. `stateOf` reads an app's state, and tells an
 * app from anything else.
 */
export function compose(
	state: AppState,
	label: 'use()' | 'plugin()',
	args: readonly unknown[],
	app: AnyAlxia,
	stateOf: (value: unknown) => AppState | undefined,
): AnyAlxia {
	if (useMiddlewares(state, args, label === 'use()')) return app;
	const plugin = pluginOf(label, args);
	const isApp = (value: unknown): value is AnyAlxia =>
		stateOf(value) !== undefined;
	const mounted = pluginApp(label, plugin, app, isApp);
	if (mounted !== plugin) return mounted;
	usePlugin(state, stateOf(plugin) as AppState);
	return app;
}

/**
 * The plugin `plugin` is given, or `use` in its deprecated plugin form —
 * a function `defineMiddleware` made was read before, as a middleware —
 * alone.
 */
export function pluginOf(label: string, args: readonly unknown[]): unknown {
	if (args.length === 0) {
		throw new TypeError(
			`${label}: nothing is given: ${label === 'use()' ? 'middlewares' : 'a plugin, an app or a function'}`,
		);
	}
	if (args.length !== 1) {
		throw new TypeError(
			`${label}: a plugin is given alone, to app.plugin(); middlewares are made with defineMiddleware() and given to use()`,
		);
	}
	return args[0];
}

/**
 * What `app.plugin(plugin)` mounts: an app, or what a function given the
 * app returns, which must be an app. `isApp` tells one. A function that
 * returns anything else — a middleware not made by `defineMiddleware`,
 * called once with the app — throws, and its promise, if it returned one,
 * is left handled: its guard would otherwise never run on any request.
 */
export function pluginApp(
	label: string,
	plugin: unknown,
	app: AnyAlxia,
	isApp: (value: unknown) => value is AnyAlxia,
): AnyAlxia {
	if (isApp(plugin)) return plugin;
	if (typeof plugin !== 'function') {
		throw new TypeError(
			`${label}: the plugin is neither an app nor a function; a middleware is made with defineMiddleware() and given to use()`,
		);
	}
	if (builtinOf(plugin) !== undefined) {
		throw new TypeError(
			`${label}: a middleware is given to use(), not taken for a plugin`,
		);
	}
	const result: unknown = plugin(app);
	if (isApp(result)) return result;
	if (result instanceof Promise) result.catch(() => {});
	throw new TypeError(
		`${label}: the plugin function returned ${result instanceof Promise ? 'a promise' : typeof result}, not an app: a plugin returns the app it is given; a middleware is made with defineMiddleware() and given to use()`,
	);
}

/**
 * `app.plugin(plugin)`, an app: its routes under this app's prefix and behind
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
