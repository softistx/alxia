/**
 * `app.plugin(plugin)`: an app given to this one — a sub-app, the routes
 * of `defineRoutes`, a plugin of `definePlugin` — or a function given this
 * app; and what a plugin's context requires of, and adds to, the app that
 * mounts it.
 */
import type { AnyReply } from '../reply/reply';
import type { Alxia } from './alxia';
import type { AnyAlxia } from './signatures';
import type {
	Empty,
	MiddlewareReturn,
	ProvidedBy,
	RequiringContext,
	ThenShortcuts,
} from './types';
import type { AppAfterUse, ScopeMiddleware } from './use-forms';

/** `app.plugin(plugin)`: an app, or a function given this app. */
export interface PluginMethod<
	App,
	Ctx extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
	/**
	 * A plugin written as a function, given this app, that returns it: a
	 * `Plugin`, such as `cors()`. A function that returns anything else than
	 * an app throws.
	 *
	 * ```ts
	 * app.plugin(cors({ origin: 'https://app.example.com' }));
	 * ```
	 */
	<Result extends AnyAlxia>(
		plugin: (
			app: App,
		) => Result & ProvidedBy<Ctx, RequiredIn<Result['~context']>>,
	): Result;
	/**
	 * A plugin. An app: its routes, under this app's prefix and behind this
	 * app's middlewares and hooks, and its hooks, which then apply to the
	 * routes declared on this app after it — a plugin can be an `auth` that
	 * only derives a `user`. Its global hooks become this app's. It is read
	 * once, here: declare it completely before giving it. A plugin made by
	 * `definePlugin`, and the routes of `defineRoutes`, name what they read
	 * from this app's context: giving one to an app that does not give it
	 * is a compile error.
	 *
	 * ```ts
	 * export const app = base.plugin(todoRoutes);
	 * ```
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
	/**
	 * @deprecated A middleware is given to `app.use(middleware)`, which
	 * this is: a package's factory — `logger()`, `cors()`, `bearer(…)` —
	 * returns one now. See the upgrading guide.
	 */
	<R1 extends MiddlewareReturn>(
		middleware: ScopeMiddleware<Ctx, [], R1>,
	): AppAfterUse<Ctx, Prefix, Shortcuts, [R1]>;
}

/**
 * What a plugin's context requires of the app that mounts it: what
 * `defineRoutes` started from, kept in its context through every route.
 */
export type RequiredIn<PluginCtx> = 0 extends 1 & PluginCtx
	? Empty
	: PluginCtx extends RequiringContext<infer Requires>
		? Requires
		: Empty;

/** What a plugin's context adds to the app that mounts it: all of it but the requirement. */
export type Mounted<PluginCtx> = 0 extends 1 & PluginCtx
	? PluginCtx
	: PluginCtx extends { readonly '~requires': unknown }
		? Omit<PluginCtx, '~requires'>
		: PluginCtx;

/**
 * The context of the routes declared after a plugin: what it adds, when
 * it has no prefix of its own. A plugin with one keeps its chain to its
 * routes, as a group does, and adds nothing to the app's.
 */
export type MountedIn<
	Ctx extends object,
	PluginCtx,
	PluginPrefix extends string,
> = PluginPrefix extends '' ? Ctx & Mounted<PluginCtx> : Ctx;
