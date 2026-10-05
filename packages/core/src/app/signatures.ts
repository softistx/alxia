/**
 * The options of an app and of its `listen`, the types its methods are
 * written in, and what a type reads of an app.
 */
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
	 * Reads the client's address. By default, the address of the connection;
	 * behind a proxy you trust, read its header instead.
	 */
	readonly ip?: (
		request: Request,
		server: Bun.Server<unknown> | undefined,
	) => string | undefined;
}

export interface ListenOptions {
	readonly port?: number | string;
	readonly hostname?: string;
	readonly development?: boolean;
	readonly idleTimeout?: number;
	readonly maxRequestBodySize?: number;
	readonly tls?: Bun.TLSOptions;
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
