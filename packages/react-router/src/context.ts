/**
 * The key under which `reactRouter()` hands every loader, action and
 * middleware the request's alxia context, and the typed way to read it.
 */
import type { Alxia, AnyAlxia, ContextOf, RegisteredBase } from '@alxia/core';
import { createContext, RouterContextProvider } from 'react-router';
import type { ReactRouterServer } from './server';

/** The default of the key: no catch-all set it. */
const MISSING: unique symbol = Symbol('alxia context missing');

/**
 * The key `reactRouter()` sets on React Router's context provider, on every
 * request, to what alxia's middlewares built for it. It lives in this package, so
 * it is one object whichever way the server was built or loaded: a key made
 * in the app's own `app/` folder is copied into React Router's build, and
 * the server that imports it separately sets a different one.
 */
export const alxiaContext = createContext<unknown>(MISSING);

/**
 * Names the server whose context `alxiaOf(context)` reads when given no
 * type argument. One React Router build has one server, so it may be
 * declared once, beside it:
 *
 * ```ts
 * // app/server.ts
 * const server = createServer({ configure: (app) => app.use(session) });
 * export default server;
 *
 * declare module '@alxia/react-router' {
 *   interface Register {
 *     server: typeof server;
 *   }
 * }
 * ```
 *
 * Unregistered here, `alxiaOf(context)` reads the app `@alxia/core`'s own
 * `Register` names as its `context`, and `BaseContext` when neither is
 * declared. When both are, this one wins: the server's app is the whole
 * app the pages run behind, the base's context and all `configure` adds.
 */
// biome-ignore lint/suspicious/noEmptyInterface: an app augments it
export interface Register {}

/** The app a server makes, or the app itself. */
export type AppOf<Server> =
	Server extends ReactRouterServer<infer App> ? App : Server;

/**
 * What `Register` names when it is neither a server nor an app — the
 * module, say, rather than its default export: an app whose context has
 * nothing but this key, so that reading anything of it is a compile error.
 */
export type InvalidRegister = Alxia<
	{
		readonly 'Register.server must be typeof server, the default export of createServer()': never;
	},
	''
>;

/**
 * The app `alxiaOf` reads for a `Register` interface: its server's, or
 * `InvalidRegister`; with no server, `Core`, the app `@alxia/core`'s
 * `Register` names (a fresh one when it names none).
 */
export type RegisteredOf<
	R,
	Core extends AnyAlxia = RegisteredBase,
> = R extends {
	readonly server: infer Server;
}
	? Server extends AnyAlxia | ReactRouterServer<AnyAlxia>
		? AppOf<Server>
		: InvalidRegister
	: Core;

/** What `alxiaOf` reads with no type argument: the registered server's app, else core's registered app, else a fresh one. */
export type RegisteredApp = RegisteredOf<Register>;

/**
 * What alxia's middlewares built for this request, read in a loader, an action or
 * a middleware, typed by the app: the server `Register` names, or the one
 * given as the type argument — `typeof server`, or an app *before* the
 * catch-all. With neither, the app `@alxia/core`'s `Register` names, and
 * `BaseContext` when nothing is registered.
 *
 * ```ts
 * export async function loader({ context }: Route.LoaderArgs) {
 *   const { user, log } = alxiaOf(context);
 * }
 * ```
 *
 * Throws when the request did not come through `reactRouter()`: under
 * `react-router dev` without the plugin, or a test that calls a loader
 * directly.
 */
export function alxiaOf<
	App extends AnyAlxia | ReactRouterServer<AnyAlxia> = RegisteredApp,
>(context: ProviderLike): AlxiaContextOf<App> {
	const value = context.get(alxiaContext);
	if (value === MISSING) {
		throw new Error(
			"alxiaOf(): this request has no alxia context. Serve the React Router app through alxia: add alxia() from @alxia/react-router/vite to vite.config.ts's plugins, or, with a server of your own, serve the build through reactRouter() from @alxia/react-router.",
		);
	}
	return value as AlxiaContextOf<App>;
}

/**
 * What `alxiaOf` and `nonceOf` read of a provider: its `get`. Not the whole
 * class, which this package gives an `alxia`: the generated route types'
 * `context` is another declaration of it, without one, and must still pass.
 */
export type ProviderLike = Pick<Readonly<RouterContextProvider>, 'get'>;

/** What `alxiaOf<App>(context)` returns, and `context.alxia` is for the registered app. */
export type AlxiaContextOf<
	App extends AnyAlxia | ReactRouterServer<AnyAlxia> = RegisteredApp,
> = ContextOf<AppOf<App>> & {
	/** The catch-all's route, which every request reaching React Router matched. */
	readonly route: string;
};

declare module 'react-router' {
	interface RouterContextProvider {
		/**
		 * What alxia's middlewares built for this request — `alxiaOf(context)`,
		 * typed by the app `Register` names (`BaseContext` with none):
		 *
		 * ```ts
		 * export async function loader({ context }: LoaderFunctionArgs) {
		 *   const { user, server } = context.alxia;
		 * }
		 * ```
		 *
		 * Typed with `react-router`'s own argument types. The generated
		 * `Route.LoaderArgs` reads a second declaration of this class (its
		 * `./internal` types point at react-router's development build), which
		 * no augmentation reaches: read `alxiaOf(context)` there. Throws as
		 * `alxiaOf` does on a request that did not come through
		 * `reactRouter()`. Server-side only: a `clientLoader` has none.
		 */
		readonly alxia: AlxiaContextOf;
	}
}

// A getter on the prototype rather than a value set on each provider: it
// reads `alxiaContext`, so it holds exactly when that key is set — a
// provider React Router copies keeps it — and on a provider no
// `reactRouter()` filled, a test's, it throws `alxiaOf`'s error rather than
// reading `undefined`.
Object.defineProperty(RouterContextProvider.prototype, 'alxia', {
	configurable: true,
	enumerable: false,
	get(this: Readonly<RouterContextProvider>) {
		return alxiaOf(this);
	},
});
