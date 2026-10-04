/**
 * The key under which `reactRouter()` hands every loader, action and
 * middleware the request's alxia context, and the typed way to read it.
 */
import type { Alxia, AnyAlxia, ContextOf } from '@alxia/core';
import { createContext, type RouterContextProvider } from 'react-router';
import type { FreshApp, ReactRouterServer } from './server';

/** The default of the key: no catch-all set it. */
const MISSING: unique symbol = Symbol('alxia context missing');

/**
 * The key `reactRouter()` sets on React Router's context provider, on every
 * request, to what alxia's hooks built for it. It lives in this package, so
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
 * Unregistered, `alxiaOf(context)` reads `BaseContext`.
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
	'',
	never
>;

/** The app `alxiaOf` reads for a `Register` interface: its server's, a fresh one, or `InvalidRegister`. */
export type RegisteredOf<R> = R extends { readonly server: infer Server }
	? Server extends AnyAlxia | ReactRouterServer<AnyAlxia>
		? AppOf<Server>
		: InvalidRegister
	: FreshApp;

/** What `alxiaOf` reads with no type argument: the registered server's app, or a fresh one. */
export type RegisteredApp = RegisteredOf<Register>;

/**
 * What alxia's hooks built for this request, read in a loader, an action or
 * a middleware, typed by the app: the server `Register` names, or the one
 * given as the type argument — `typeof server`, or an app *before* the
 * catch-all. With neither, `BaseContext`.
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
>(context: Readonly<RouterContextProvider>): ContextOf<AppOf<App>> {
	const value = context.get(alxiaContext);
	if (value === MISSING) {
		throw new Error(
			"alxiaOf(): this request has no alxia context. Serve the React Router app through alxia: add alxia() from @alxia/react-router/vite to vite.config.ts's plugins, or, with a server of your own, serve the build through reactRouter() from @alxia/react-router.",
		);
	}
	return value as ContextOf<AppOf<App>>;
}
