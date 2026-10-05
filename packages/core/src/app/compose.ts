/**
 * How an app takes in the parts it is put together from: a group's routes,
 * declared in a scope of their own, and a plugin's routes and middlewares.
 */
import { joinPath } from '../router/paths';
import { type AppState, mount, register } from './app-state';
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
 * starts with every middleware in force here and shares this app's
 * lifecycle hooks.
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
	// A group with a prefix of its own guards what no route answers under it.
	if (prefix !== state.prefix) state.scope.enclose(childState.scope, prefix);
}

/**
 * `app.plugin(plugin)`: an app, or what a function given this app
 * returns, mounted. `stateOf` reads an app's state, and tells an app from
 * anything else.
 */
export function compose(
	state: AppState,
	args: readonly unknown[],
	app: AnyAlxia,
	stateOf: (value: unknown) => AppState | undefined,
): AnyAlxia {
	if (args.length !== 1) {
		throw new TypeError(
			`plugin(): ${args.length === 0 ? 'nothing is given' : 'a plugin is given alone'}: an app or a function that returns one; middlewares are given to use()`,
		);
	}
	const isApp = (value: unknown): value is AnyAlxia =>
		stateOf(value) !== undefined;
	const mounted = pluginApp(args[0], app, isApp);
	if (mounted !== args[0]) return mounted;
	usePlugin(state, stateOf(mounted) as AppState);
	return app;
}

/**
 * What `app.plugin(plugin)` mounts: an app, or what a function given the
 * app returns, which must be an app. `isApp` tells one. A function that
 * returns anything else — a middleware, called once with the app — throws,
 * and its promise, if it returned one, is left handled: its guard would
 * otherwise never run on any request.
 */
function pluginApp(
	plugin: unknown,
	app: AnyAlxia,
	isApp: (value: unknown) => value is AnyAlxia,
): AnyAlxia {
	if (isApp(plugin)) return plugin;
	if (typeof plugin !== 'function' || builtinOf(plugin) !== undefined) {
		throw new TypeError(
			'plugin(): the plugin is neither an app nor a function that returns one; a middleware is given to use()',
		);
	}
	const result: unknown = plugin(app);
	if (isApp(result)) return result;
	if (result instanceof Promise) result.catch(() => {});
	throw new TypeError(
		`plugin(): the plugin function returned ${result instanceof Promise ? 'a promise' : typeof result}, not an app: a plugin returns the app it is given; a middleware is given to use()`,
	);
}

/**
 * `app.plugin(plugin)`, an app: its routes under this app's prefix and behind
 * its middlewares, its middlewares for the routes declared after it, its
 * lifecycle hooks.
 */
export function usePlugin(state: AppState, plugin: AppState): void {
	const { prefix, scope } = state;
	for (const route of plugin.routes) {
		register(state, scope.behind(route, joinPath(prefix, route.path), prefix));
	}
	for (const socket of plugin.sockets) {
		mount(state, scope.behind(socket, joinPath(prefix, socket.path), prefix));
	}
	scope.absorb(plugin.scope, prefix, plugin.prefix);
	mergeGlobals(state.runtime, plugin.runtime.globals, state.prefix);
}
