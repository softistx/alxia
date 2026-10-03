/**
 * The key under which `reactRouter()` hands every loader, action and
 * middleware the request's alxia context, and the typed way to read it.
 */
import type { AnyAlxia, ContextOf } from '@alxia/core';
import { createContext, type RouterContextProvider } from 'react-router';

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
 * What alxia's hooks built for this request, read in a loader, an action or
 * a middleware, typed by the app: pass the type of the app *before* the
 * catch-all.
 *
 * ```ts
 * export async function loader({ context }: Route.LoaderArgs) {
 *   const { user, log } = alxiaOf<Base>(context);
 * }
 * ```
 *
 * Throws when the request did not come through `reactRouter()`: under
 * `react-router dev` alone, or a test that calls a loader directly.
 */
export function alxiaOf<App extends AnyAlxia>(
	context: Readonly<RouterContextProvider>,
): ContextOf<App> {
	const value = context.get(alxiaContext);
	if (value === MISSING) {
		throw new Error(
			'alxiaOf(): this request has no alxia context. Serve the React Router build through reactRouter() from @alxia/react-router.',
		);
	}
	return value as ContextOf<App>;
}
