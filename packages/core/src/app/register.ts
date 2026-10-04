/**
 * `Register`: the app's context, named once, read by every file that
 * imports `@alxia/core` without importing the app.
 */
import type { Alxia } from './alxia';
import type { AnyAlxia, ContextOf } from './signatures';
import type { Empty, RequiringContext } from './types';

/**
 * Names the chain that builds the app's context — its `decorate`, its
 * `derive`, the plugins and middlewares `use` adds — so that `AppContext`
 * and `defineRoutes` read it with no import of the app:
 *
 * ```ts
 * // src/context.ts
 * export const base = alxia().decorate({ db }).use(session);
 *
 * declare module '@alxia/core' {
 *   interface Register {
 *     context: typeof base;
 *   }
 * }
 * ```
 *
 * Register `base`, never the app that mounts the routes: a route file's
 * type reads `Register`, so an app that mounts it would be typed by
 * itself, and TypeScript gives it `any` (TS7022). A program has one
 * `Register`: a second, different `context` is TS2717.
 *
 * Unregistered, `AppContext` is `BaseContext`.
 */
// biome-ignore lint/suspicious/noEmptyInterface: an app augments it
export interface Register {}

/**
 * What `Register` names when its `context` is not an app — the module,
 * say, or the app's context rather than the app: an app whose context has
 * nothing but this key, so that reading anything of it is a compile error.
 */
export type InvalidRegister = Alxia<
	{
		readonly 'Register.context must be typeof base, the alxia() chain that decorates and derives the context': never;
	},
	'',
	never
>;

/** The app a `Register`-shaped interface names: its `context`, a fresh app, or `InvalidRegister`. */
export type RegisteredOf<R> = R extends { readonly context: infer App }
	? App extends AnyAlxia
		? App
		: InvalidRegister
	: Alxia<Empty, '', never>;

/** The app `Register` names, or a fresh one: what `AppContext` and `defineRoutes` read. */
export type RegisteredBase = RegisteredOf<Register>;

/**
 * The registered app's context: what a route of `defineRoutes` reads, and
 * a service, a resolver, `contextStorage()` with it. `BaseContext` when
 * nothing is registered.
 *
 * ```ts
 * export async function listTodos({ db, user }: AppContext) { … }
 * ```
 *
 * A middleware that reads it says so, and is then refused on a route
 * whose context does not give it: `defineMiddleware<AppContext>()(fn)`.
 */
export type AppContext = ContextOf<RegisteredBase>;

/**
 * What `defineRoutes` starts from: the registered context, with the
 * requirement in it, so that it survives every route, `derive` and `use`
 * declared on it, up to the `use` that mounts it.
 */
export type RoutesContext = RegisteredBase['~context'] &
	RequiringContext<RegisteredBase['~context']>;
