/**
 * The types of how an app is put together from parts: `group`, routes in a
 * scope of their own; and `use`, middlewares for the routes after it.
 * `plugin`'s is `PluginMethod` (`plugin-method.ts`).
 */
import type { JoinPath, RoutePath } from '../types/path';
import type { Alxia } from './alxia';
import type { RequiredIn } from './plugin-method';
import type { AnyAlxia } from './signatures';
import type { ProvidedBy } from './types';
import type { UseForms } from './use-forms';

/** `app.group(prefix, build)` or `app.group(build)`. */
export interface GroupMethod<Ctx extends object, Prefix extends string> {
	/**
	 * Routes declared in a scope: the middlewares `build` adds apply only to
	 * them. The routes keep every middleware declared on this app before
	 * the group.
	 *
	 * ```ts
	 * app.group('/admin', (admin) => admin.use(requireAdmin).get('/stats', ...));
	 * ```
	 */
	<const Path extends RoutePath, Built extends AnyAlxia>(
		prefix: Path,
		build: (
			group: Alxia<Ctx, JoinPath<Prefix, Path>>,
		) => Built & ProvidedBy<Ctx, RequiredIn<Built['~context']>>,
	): Alxia<Ctx, Prefix>;
	/** Routes declared in a scope, under this app's prefix. */
	<Built extends AnyAlxia>(
		build: (
			group: Alxia<Ctx, Prefix>,
		) => Built & ProvidedBy<Ctx, RequiredIn<Built['~context']>>,
	): Alxia<Ctx, Prefix>;
}

/**
 * `app.use(...middlewares)` and `app.use(path, ...middlewares)`, see
 * `UseForms`: each middleware a `(ctx, next)` function, written inline or
 * made by `defineMiddleware`. A plugin is given to `app.plugin`.
 */
export interface UseMethod<Ctx extends object, Prefix extends string>
	extends UseForms<Ctx, Prefix> {}
