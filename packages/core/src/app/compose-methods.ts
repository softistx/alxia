/**
 * The types of how an app is put together from parts: `group`, routes in a
 * scope of their own; `use`, a plugin.
 */
import type { AnyReply } from '../reply/reply';
import type { JoinPath, RoutePath } from '../types/path';
import type { Alxia } from './alxia';
import type { AnyAlxia } from './signatures';
import type {
	BehindShortcuts,
	Empty,
	ProvidedBy,
	RouteRecord,
	ThenShortcuts,
} from './types';

/** The routes of a plugin, under the prefix of the app it is used by. */
type Prefixed<Prefix extends string, Routes, Shortcuts> = {
	readonly [Path in keyof Routes as Path extends string
		? JoinPath<Prefix, Path>
		: never]: {
		readonly [M in keyof Routes[Path]]: Routes[Path][M] extends RouteRecord<
			infer Input,
			infer Output
		>
			? RouteRecord<Input, BehindShortcuts<Output, Shortcuts>>
			: Routes[Path][M];
	};
};

/** `app.group(prefix, build)` or `app.group(build)`. */
export interface GroupMethod<
	Ctx extends object,
	Routes extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
	/**
	 * Routes declared in a scope: the hooks `build` adds apply only to them.
	 * The routes keep every hook declared on this app before the group.
	 *
	 * ```ts
	 * app.group('/admin', (admin) => admin.derive(requireAdmin).get('/stats', ...));
	 * ```
	 */
	<
		const Path extends RoutePath,
		GroupRoutes extends object,
		GroupCtx extends object,
		GroupShortcuts extends AnyReply,
	>(
		prefix: Path,
		build: (
			group: Alxia<Ctx, Empty, JoinPath<Prefix, Path>, Shortcuts>,
		) => Alxia<GroupCtx, GroupRoutes, JoinPath<Prefix, Path>, GroupShortcuts>,
	): Alxia<Ctx, Routes & GroupRoutes, Prefix, Shortcuts>;
	/** Routes declared in a scope, under this app's prefix. */
	<
		GroupRoutes extends object,
		GroupCtx extends object,
		GroupShortcuts extends AnyReply,
	>(
		build: (
			group: Alxia<Ctx, Empty, Prefix, Shortcuts>,
		) => Alxia<GroupCtx, GroupRoutes, Prefix, GroupShortcuts>,
	): Alxia<Ctx, Routes & GroupRoutes, Prefix, Shortcuts>;
}

/** `app.use(plugin)`: an app, or a function given this app. */
export interface UseMethod<
	App,
	Ctx extends object,
	Routes extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
	/**
	 * A plugin written as a function, given this app, that returns it: a
	 * `Plugin`.
	 */
	<Result extends AnyAlxia>(plugin: (app: App) => Result): Result;
	/**
	 * A plugin. An app: its routes, under this app's prefix and behind this
	 * app's hooks, and its hooks, which then apply to the routes declared on
	 * this app after it — a plugin can be an `auth` that only derives a
	 * `user`. Its global hooks become this app's. It is read once, here:
	 * declare it completely before using it. A plugin made by `definePlugin`
	 * names what it reads from this app's context: using it on an app that
	 * does not give it is a compile error.
	 */
	<
		PluginCtx extends object,
		PluginRoutes extends object,
		PluginPrefix extends string,
		PluginShortcuts extends AnyReply,
		PluginRequires = Empty,
	>(
		plugin: Alxia<PluginCtx, PluginRoutes, PluginPrefix, PluginShortcuts> & {
			readonly '~requires'?: PluginRequires;
		} & ProvidedBy<Ctx, PluginRequires>,
	): Alxia<
		Ctx & PluginCtx,
		Routes & Prefixed<Prefix, PluginRoutes, Shortcuts>,
		Prefix,
		ThenShortcuts<Shortcuts, PluginShortcuts>
	>;
}
