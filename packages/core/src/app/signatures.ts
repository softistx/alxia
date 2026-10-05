/**
 * The options of an app and of its `listen`, the types its methods are
 * written in, and what a type reads of an app.
 */
import type { RouteRow } from '../dev/route-table';
import type { ErrorFormat } from '../errors/problems';
import type { ProxyTrust } from '../request/trust-proxy';
import type { Alxia } from './alxia';
import type { BaseContext } from './types';

export interface AlxiaOptions<Prefix extends string> {
	/** Prepended to the path of every route declared on this app. */
	readonly prefix?: Prefix;
	/**
	 * Whether a reply is checked against the schema its route declares for
	 * its status, and sent as that schema's output: an unknown key the
	 * schema strips never leaves the server. On by default; a reply that
	 * fails is answered with a 500.
	 */
	readonly validateResponses?: boolean;
	/**
	 * How the app answers the errors it answers itself — an escaped
	 * `HttpError`, a refusal's 400 and 413, a 500, the router's 404, 405
	 * and 426: `json`, its `{ error: … }` bodies, by default; `problem`,
	 * RFC 9457 problem details sent as `application/problem+json`. The app
	 * that serves the request decides: a plugin's own option is not read.
	 */
	readonly errors?: ErrorFormat;
	/**
	 * Whether the app helps the developer running it: `listen` prints its
	 * URL and its routes, a 404 or a 405 it answers carries a `hint` naming
	 * the closest route, and a 500 shows its error — an HTML page to a
	 * browser, its `stack` in a JSON body. Off unless `NODE_ENV` is exactly
	 * `development` (`Bun.env`, read when the app is made) — fail closed:
	 * unset, `production`, `staging` are off; `true` or `false` decides.
	 * The app that serves the request decides, as for `errors`.
	 */
	readonly dev?: boolean;
	/**
	 * Reads the client's address. By default, the address of the connection,
	 * in its canonical text (`canonicalIp`); behind a proxy you trust, read
	 * its header instead. What a function given here returns is read as is.
	 */
	readonly ip?: (
		request: Request,
		server: Bun.Server<unknown> | undefined,
	) => string | undefined;
	/**
	 * The proxies in front of the app, `trustProxy({ trusted })`: declared
	 * once, they give `ctx.ip`, in place of `ip`, and the scheme and host
	 * the client asked for, `originalUrl(ctx)`; with `untrusted: 'refuse'`,
	 * a request whose forwarding headers come from another connection is
	 * answered 403, and with `'refuse-all'` any request from one that
	 * `allow` does not let through. Give `ip` or `proxy`, not both.
	 */
	readonly proxy?: ProxyTrust;
}

export interface ListenOptions {
	readonly port?: number | string;
	readonly hostname?: string;
	readonly development?: boolean;
	readonly idleTimeout?: number;
	readonly maxRequestBodySize?: number;
	readonly tls?: Bun.TLSOptions;
	/**
	 * The signals the app shuts down on, gracefully, before the process
	 * exits — 0 once every `onStop` hook ran, 1 when one threw:
	 * `['SIGINT', 'SIGTERM']` by default; `false` installs none, for a
	 * process that handles its signals itself and calls `stop()`.
	 */
	readonly signals?: readonly NodeJS.Signals[] | false;
	/**
	 * Whether the process exits once a signal shut the app down: `true` by
	 * default. `false` shuts the app down and calls no `process.exit`, for
	 * a host that exits itself after its own cleanup. alxia does not exit
	 * either when the process has another listener of the signal: the
	 * host's own handler finishes, and exits.
	 */
	readonly exit?: boolean;
	/**
	 * How long, in milliseconds, the requests in flight have to finish once
	 * shutdown starts, before the server closes their connections: 10 000
	 * by default.
	 */
	readonly shutdownTimeout?: number;
	/**
	 * How long, in milliseconds, the `onStop` hooks have, all of them, once
	 * the requests drained: 5 000 by default. Past it, the hook still
	 * running is logged by name and the shutdown fails, so a signal exits
	 * with 1 rather than hang.
	 */
	readonly stopTimeout?: number;
	/**
	 * Called once the server listens, in every mode, with its URL, its
	 * routes and the route table as text: what an app that logs its own
	 * way gives, in place of the table `listen` prints in dev. A throw is
	 * logged, and the server keeps listening.
	 */
	readonly onListen?: (info: ListenInfo) => void;
}

/** What `onListen` is told once the server listens. */
export interface ListenInfo {
	readonly server: Bun.Server<unknown>;
	readonly url: URL;
	/** Every route, in the order declared, then the pages. */
	readonly routes: readonly RouteRow[];
	/** The route table, as `listen` prints it in dev. */
	readonly table: string;
	/** The app's `dev` switch: whether `listen` would have printed the table. */
	readonly dev: boolean;
}

/** Any app, whatever it holds. */
export type AnyAlxia = Alxia<any, any>;

/**
 * A plugin written as a function: it receives the app and returns it, with
 * lifecycle hooks or parsers added. A plugin that adds to the context or declares routes
 * is an app of its own; both are given to `app.plugin`.
 */
export type Plugin = <App extends AnyAlxia>(app: App) => App;

/**
 * What a route declared next on `App` reads: the context its middlewares
 * build — `decorate`, `derive`, `use` — on top of the base
 * context. A GraphQL schema, a service, types its own context with it.
 */
export type ContextOf<App> = App extends { readonly '~context': infer Ctx }
	? BaseContext & Ctx
	: never;
