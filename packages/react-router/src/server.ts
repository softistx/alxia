/**
 * `createServer()`: the alxia server of a React Router app, as
 * `@alxia/react-router/vite` builds it. The plugin hands it React Router's
 * build, the mode and the client folder; the app's own `app/server.ts`
 * customises the rest, or is not written at all.
 */
import {
	type Alxia,
	type AnyAlxia,
	alxia,
	type ContextOf,
	type Empty,
	type ListenOptions,
	type MaybePromise,
} from '@alxia/core';
import type { RouterContextProvider, ServerBuild } from 'react-router';
import { declareClient, reactRouter } from './react-router';

/** An app as `alxia()` makes it: what `beforeAll`, or `configure`, receives. */
export type FreshApp = Alxia<Empty, Empty, '', never>;

/**
 * What the Vite plugin hands the server, and a test passes to `create`:
 * React Router's server build, its mode, and the client build's folder.
 */
export interface ServerWiring {
	/**
	 * React Router's server build, or a function that returns it: called on
	 * every request in `development`, once in `production`.
	 */
	readonly build: ServerBuild | (() => MaybePromise<ServerBuild>);
	/** `development` under `react-router dev`, `production` in a build, and by default. */
	readonly mode?: 'development' | 'production';
	/** The client build's folder, a path or a `file:` URL: served in `production`. */
	readonly client?: string | URL | undefined;
}

export interface ServerOptions<Before extends AnyAlxia, App extends AnyAlxia> {
	/**
	 * Runs first, on a new app: what is declared here runs before the
	 * client's files too — a guard, a rate limit, a logger that should see
	 * every request. Returns the app, so its types flow to `configure`.
	 */
	readonly beforeAll?: (app: FreshApp) => Before;
	/**
	 * The app the pages run behind: its plugins, its hooks, its `/api`.
	 * Declared after the client's files and before the catch-all. Returns
	 * the app: what it builds is what the loaders read through `alxiaOf`.
	 */
	readonly configure?: (app: Before) => App;
	/**
	 * Sets the app's own keys on React Router's context provider, `ctx`
	 * typed by `configure`'s app. `alxiaContext` is always set.
	 */
	readonly getLoadContext?: (
		ctx: ContextOf<App>,
		context: RouterContextProvider,
	) => MaybePromise<void>;
	/** Overrides the plugin's server build: rarely wanted. */
	readonly build?: ServerWiring['build'];
	/** Overrides the plugin's mode, `development` in dev and `production` in a build. */
	readonly mode?: 'development' | 'production';
	/**
	 * Overrides the plugin's client folder, `build/client` beside the built
	 * server. `false` serves none of it: declare the files yourself, in
	 * `beforeAll` or `configure`.
	 */
	readonly client?: string | URL | false;
	/**
	 * `listen`'s options for `bun build/server/index.js`; a `port` or `hostname` here wins over `PORT` (3000)
	 * and `HOST` (`0.0.0.0`) from the environment.
	 */
	readonly listen?: ListenOptions;
	/** Called once the built server listens. Prints `alxia listening on <url>` by default. */
	readonly onListen?: (server: Bun.Server<unknown>) => void;
}

/**
 * The server `createServer()` describes, made into an app by the Vite
 * plugin, by a test, or by a server file of your own.
 */
export interface ReactRouterServer<App extends AnyAlxia> {
	/**
	 * The app, serving React Router's build: `build/server/index.js`'s
	 * default export. A test drives it with `app.request`.
	 *
	 * ```ts
	 * const app = server.create({ build: await import('./build/server/index.js') });
	 * ```
	 */
	create(wiring: ServerWiring): App;
	/**
	 * Listens with `app`, on `listen`, `PORT` and `HOST`, and stops it on
	 * `SIGINT` or `SIGTERM`: its `onStop` hooks run, and the process exits.
	 * What `bun build/server/index.js` runs.
	 */
	start(app: App): Bun.Server<unknown>;
}

/**
 * The alxia server of a React Router app, for `app/server.ts`. Every option
 * is optional: the Vite plugin wires React Router's build, the mode and the
 * client folder, and without the file uses `createServer()` as it is.
 *
 * ```ts
 * const server = createServer({
 *   configure: (app) => app.use(logger()).get('/api/health', ({ reply }) => reply.ok({ ok: true })),
 * });
 * export default server;
 * ```
 *
 * The request runs through `beforeAll`, the client's files, `configure`,
 * then the pages.
 */
export function createServer<
	Before extends AnyAlxia = FreshApp,
	App extends AnyAlxia = Before,
>(options: ServerOptions<Before, App> = {}): ReactRouterServer<App> {
	return {
		create(wiring) {
			const mode = options.mode ?? wiring.mode ?? 'production';
			const client =
				options.client === false
					? undefined
					: (options.client ?? wiring.client);
			const fresh = alxia();
			// Without beforeAll or configure, Before and App are their defaults,
			// the app passed through: a type argument given by hand is believed.
			const before = (options.beforeAll?.(fresh) ?? fresh) as Before;
			if (client !== undefined && mode === 'production') {
				declareClient(before, client);
			}
			const app = (options.configure?.(before) ?? before) as App;
			const getLoadContext = options.getLoadContext;
			reactRouter(app, {
				build: options.build ?? wiring.build,
				mode,
				...(getLoadContext === undefined
					? {}
					: {
							getLoadContext: (ctx, context) =>
								getLoadContext(ctx as ContextOf<App>, context),
						}),
			});
			return app;
		},
		start(app) {
			const server = app.listen({
				port: Number(process.env['PORT'] || 3000),
				hostname: process.env['HOST'] || '0.0.0.0',
				...options.listen,
			});
			(options.onListen ?? announce)(server);
			// Stop as the platform asks: the app's onStop hooks run, and the process ends.
			for (const signal of ['SIGINT', 'SIGTERM'] as const) {
				process.once(signal, () => {
					void app.stop().then(
						() => process.exit(0),
						(error: unknown) => {
							console.error(error);
							process.exit(1);
						},
					);
				});
			}
			return server;
		},
	};
}

function announce(server: Bun.Server<unknown>): void {
	console.log(`alxia listening on ${server.url}`);
}
