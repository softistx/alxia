/**
 * The types of how an app is put together from parts: `group`, routes in a
 * scope of their own; `use`, middlewares for the routes after it, and its
 * plugin forms, deprecated for `plugin` (`plugin-method.ts`).
 */
import type { AnyReply } from '../reply/reply';
import type { JoinPath, RoutePath } from '../types/path';
import type { Alxia } from './alxia';
import type { MountedIn, RequiredIn } from './plugin-method';
import type { AnyAlxia } from './signatures';
import type { Empty, ProvidedBy, ThenShortcuts } from './types';
import type { UseForms } from './use-forms';

/** `app.group(prefix, build)` or `app.group(build)`. */
export interface GroupMethod<
	Ctx extends object,
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
	<const Path extends RoutePath, Built extends AnyAlxia>(
		prefix: Path,
		build: (
			group: Alxia<Ctx, JoinPath<Prefix, Path>, Shortcuts>,
		) => Built & ProvidedBy<Ctx, RequiredIn<Built['~context']>>,
	): Alxia<Ctx, Prefix, Shortcuts>;
	/** Routes declared in a scope, under this app's prefix. */
	<Built extends AnyAlxia>(
		build: (
			group: Alxia<Ctx, Prefix, Shortcuts>,
		) => Built & ProvidedBy<Ctx, RequiredIn<Built['~context']>>,
	): Alxia<Ctx, Prefix, Shortcuts>;
}

/**
 * `app.use(...middlewares)`, `app.use(path, ...middlewares)`, see
 * `UseForms`; and the plugin forms of 0.3, deprecated for `app.plugin`,
 * see `PluginForms`. A function made by `defineMiddleware` is a
 * middleware; any other function is a plugin. The plugin forms come first,
 * so that a middleware a route's context does not give is reported on the
 * middleware forms, naming the key: TypeScript 7 prints the last overload
 * alone, and TypeScript 6 lists the plugin forms, then them.
 */
export interface UseMethod<
	App,
	Ctx extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> extends PluginForms<App, Ctx, Prefix, Shortcuts>,
		UseForms<Ctx, Prefix, Shortcuts> {}

/** `app.use(plugin)`, deprecated: `app.plugin(plugin)`, see `PluginMethod`. */
export interface PluginForms<
	App,
	Ctx extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
	/**
	 * @deprecated A plugin is given to `app.plugin(plugin)`: `use` takes
	 * middlewares alone, and will take any `(ctx, next)` function in the
	 * next minor. See the upgrading guide.
	 */
	<Result extends AnyAlxia>(
		plugin: (
			app: App,
		) => Result & ProvidedBy<Ctx, RequiredIn<Result['~context']>>,
	): Result;
	/**
	 * @deprecated A plugin is given to `app.plugin(plugin)`: `use` takes
	 * middlewares alone, and will take any `(ctx, next)` function in the
	 * next minor. See the upgrading guide.
	 */
	<
		PluginCtx extends object,
		PluginPrefix extends string,
		PluginShortcuts extends AnyReply,
		PluginRequires = Empty,
	>(
		plugin: Alxia<PluginCtx, PluginPrefix, PluginShortcuts> & {
			readonly '~requires'?: PluginRequires;
		} & ProvidedBy<Ctx, PluginRequires> &
			ProvidedBy<Ctx, RequiredIn<PluginCtx>>,
	): Alxia<
		MountedIn<Ctx, PluginCtx, PluginPrefix>,
		Prefix,
		ThenShortcuts<Shortcuts, PluginShortcuts>
	>;
}
