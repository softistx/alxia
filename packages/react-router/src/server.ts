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
	type ListenInfo,
	type ListenOptions,
	type MaybePromise,
	type ProxyTrust,
} from '@alxia/core';
import type { RouterContextProvider, ServerBuild } from 'react-router';
import { declareClient, reactRouter } from './react-router';

/** An app as `alxia()` makes it: what `beforeAll`, or `configure`, receives. */
export type FreshApp = Alxia<Empty, ''>;

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
	 * The app the pages run behind: its middlewares, its plugins, its `/api`.
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
	/**
	 * The proxies in front of the app, `trustProxy({ trusted })` from
	 * `@alxia/core`: `alxia({ proxy })`'s option, so `ctx.ip` is the
	 * client's and React Router's `request.url` the URL it asked for.
	 */
	readonly proxy?: ProxyTrust;
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
	 * `listen`'s options for `bun build/server/index.js` — `shutdownTimeout`,
	 * `signals` among them; a `port` or `hostname` here wins over `PORT` (3000)
	 * and `HOST` (`0.0.0.0`) from the environment.
	 */
	readonly listen?: ListenOptions;
	/**
	 * Called once the built server listens and its `SIGINT` and `SIGTERM` handlers are in place.
	 * Prints `alxia listening on <url>` by default, and in dev the route
	 * table (`alxia({ dev })`). An `onListen` in `listen` wins over it.
	 */
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
	 * Listens with `app`, on `listen`, `PORT` and `HOST`, and shuts it down
	 * gracefully on `SIGINT` or `SIGTERM`, as `@alxia/core`'s `listen` does:
	 * the requests in flight finish within `shutdownTimeout`, its `onStop`
	 * hooks run, and the process exits. What `bun build/server/index.js` runs.
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
			// The app helps the developer in React Router's dev alone: a production
			// build is never in dev, whatever NODE_ENV says.
			const fresh = alxia({
				dev: mode === 'development',
				...(options.proxy === undefined ? {} : { proxy: options.proxy }),
			});
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
			const own = options.listen?.onListen;
			// `listen` shuts the app down on SIGINT and SIGTERM — readiness 503,
			// the requests in flight drained, the onStop hooks, then the exit —
			// with its handlers in place before it tells onListen: a supervisor
			// may signal as soon as it reads that the server listens.
			return app.listen({
				port: Number(process.env['PORT'] || 3000),
				hostname: process.env['HOST'] || '0.0.0.0',
				...options.listen,
				onListen: (info) => {
					if (own !== undefined) own(info);
					else if (options.onListen !== undefined) {
						options.onListen(info.server);
					} else announce(info);
				},
			});
		},
	};
}

/** In dev, the route table `listen` prints; else one line. */
function announce({ dev, table, url }: ListenInfo): void {
	console.log(dev ? table : `alxia listening on ${url}`);
}
