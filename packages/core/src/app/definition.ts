/**
 * An app as it runs: its lifecycle hooks, and the definition of each route
 * and socket route it holds, with the middlewares declared before it.
 */
import type { AnyReply } from '../reply/reply';
import type { BodyParser } from '../request/read';
import type { Router } from '../router/router';
import type { SocketHandlers, SocketSchema } from '../ws/types';
import type { ScopedHooks } from './scope';
import type { ScopePath } from './scope-path';
import type { Served } from './served';
import type {
	MaybePromise,
	Method,
	ResponseSchemas,
	RouteSchema,
} from './types';
import type { RequestSchemas } from './validate';

/** A `derive`: it may add to the context or end the request. */
export type DeriveHook = (ctx: Record<string, unknown>) => unknown;
/**
 * A middleware: it returns what `next(added)` resolves to, a reply, or a
 * `Response`.
 */
export type MiddlewareHook = (
	ctx: Record<string, unknown>,
	next: (added?: object) => Promise<Response>,
) => unknown;
/**
 * A step of a route's chain, in the order declared: a `derive` or a
 * middleware in force where it was declared, a middleware of its own,
 * its validation, the check of its replies.
 */
export type ChainHook =
	| {
			readonly kind: 'derive';
			readonly run: DeriveHook;
			/** A group's or a prefixed plugin's, on a request no route matches: run only under its prefix. */
			readonly when?: ScopePath;
	  }
	| {
			readonly kind: 'middleware';
			readonly run: MiddlewareHook;
			/** Given a path by `use`, run only on a request under it. */
			readonly when?: ScopePath;
	  }
	| { readonly kind: 'validate'; readonly schemas: RequestSchemas }
	| { readonly kind: 'responds'; readonly responses: ResponseSchemas };

export type StartHook = (server: Bun.Server<unknown>) => MaybePromise<void>;
export type StopHook = () => MaybePromise<void>;

/** A route as the app runs it: its options, its handler, and the middlewares declared before it. */
export interface RouteDefinition {
	readonly method: Method;
	readonly path: string;
	/**
	 * Its options — `detail`, `bodyLimit` — for a tool that reads
	 * `app.routes`. The schemas of its `validate` and `responds` stay in its
	 * chain: the OpenAPI document declares them.
	 */
	readonly schema: RouteSchema;
	/**
	 * The most bytes its request body may hold: its options' `bodyLimit`,
	 * else the `bodyLimit` in effect where it was declared. None, no limit
	 * beyond the server's `maxRequestBodySize`.
	 */
	readonly bodyLimit?: number;
	readonly handler: (ctx: never) => MaybePromise<AnyReply>;
	/**
	 * Its chain, run before its handler: the middlewares in force where it
	 * was declared, then its own, its validation among them.
	 */
	readonly derive: readonly ChainHook[];
}

/** A socket route as the app runs it. */
export interface SocketDefinition {
	readonly path: string;
	readonly schema: SocketSchema;
	readonly handlers: SocketHandlers<never, never, never>;
	readonly derive: readonly ChainHook[];
}

export type Definition =
	| ({ readonly kind: 'http' } & RouteDefinition)
	| ({ readonly kind: 'ws' } & SocketDefinition);

/** What is global to an app, wherever it is declared: a group's or a plugin's included. */
export interface Globals {
	readonly onStart: StartHook[];
	readonly onStop: StopHook[];
	readonly parsers: BodyParser[];
	/** Bun's HTML bundles, by their full path: served by `Bun.serve` itself. */
	readonly pages: Map<string, Bun.HTMLBundle>;
}

/** What a request reads of an app: its routes, its lifecycle hooks and parsers, its options. */
export interface Runtime {
	readonly router: Router<Definition>;
	/** The chain a request no route matches runs: the app's own, every `use()` of it wherever declared. */
	readonly unmatched: () => ScopedHooks;
	/** Shared with the app's groups, whose lifecycle hooks and parsers are the app's. */
	readonly globals: Globals;
	readonly validateResponses: boolean;
	/** What its requests read of it: its error format, whether it is shutting down. */
	readonly served: Served;
	/** The sockets open on it, closed with 1001 when it shuts down. */
	readonly sockets: Set<Bun.ServerWebSocket<unknown>>;
	/** The `ip` option, or the address of the connection. */
	readonly ip: (
		request: Request,
		server: Bun.Server<unknown> | undefined,
	) => string | undefined;
}
