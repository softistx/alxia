/**
 * An app as it runs: its hooks, and the definition of each route and socket
 * route it holds, with the hooks declared before it.
 */
import type { Refusal, RefusalKind } from '../errors/errors';
import type { AnyReply } from '../reply/reply';
import type { BodyParser } from '../request/read';
import type { Router } from '../router/router';
import type { SocketHandlers, SocketSchema } from '../ws/types';
import type {
	BaseContext,
	MaybePromise,
	Method,
	RequestContext,
	ResponseSchemas,
	RouteSchema,
} from './types';
import type { RequestSchemas } from './validate';

/** A hook that runs before validation, and may add to the context or end the request. */
export type DeriveHook = (ctx: Record<string, unknown>) => unknown;
/** A hook around the rest of a route: the hooks after it, validation, the handler. */
export type WrapHook = (
	ctx: Record<string, unknown>,
	next: () => Promise<Response>,
) => MaybePromise<Response | AnyReply>;
/**
 * A middleware: it returns what `next(added)` resolves to, a reply, or a
 * `Response`.
 */
export type MiddlewareHook = (
	ctx: Record<string, unknown>,
	next: (added?: object) => Promise<Response>,
) => unknown;
/**
 * A step of a route's chain, in the order declared: a hook in force where
 * it was declared or in its list, a middleware, its validation, the check
 * of its replies. `raw` is the validation of a route declared without
 * middlewares, the form of 0.3: every part it has no schema for is set to
 * the request's, the body to `undefined`.
 */
export type ChainHook =
	| { readonly kind: 'derive'; readonly run: DeriveHook }
	| { readonly kind: 'wrap'; readonly run: WrapHook }
	| { readonly kind: 'middleware'; readonly run: MiddlewareHook }
	| {
			readonly kind: 'validate';
			readonly schemas: RequestSchemas;
			readonly raw?: boolean;
	  }
	| { readonly kind: 'responds'; readonly responses: ResponseSchemas };
/** A hook that turns an error into a reply, or lets the next one try. */
export type ErrorHook = (
	error: unknown,
	ctx: BaseContext,
) => MaybePromise<AnyReply | undefined | void>;
/** A hook that answers a request the app refused: a reply, or nothing for the default. */
export type RefusalHook = (
	refusal: Refusal,
	ctx: BaseContext,
) => MaybePromise<AnyReply | undefined | void>;
/** The `onRefusal` hook in force for a route, and the schemas it declares. */
export interface RefusalHandler {
	readonly hook: RefusalHook;
	/** The schema of each status the hook may answer: its reply is checked by it, and documented. */
	readonly response?: ResponseSchemas;
	/** The `content-type` of its reply, unless the reply sets one; documented too. */
	readonly contentType?: string;
}

/**
 * The `onRefusal(kind, hook)` handlers in force for a route, by kind:
 * tried in order before its general `refusal`, the first that returns a
 * reply answering. A plugin's route lists its own before the app's.
 */
export type RefusalHandlersByKind = {
	readonly [Kind in RefusalKind]?: readonly RefusalHandler[];
};

/** Runs on every request, before routing; a `Response` it returns is sent as it is. */
export type RequestHook = (
	ctx: RequestContext,
) => MaybePromise<Response | undefined | void>;
/** Runs on every response, routed or not; a `Response` it returns replaces it. */
export type ResponseHook = (
	response: Response,
	ctx: RequestContext,
) => MaybePromise<Response | undefined | void>;
/**
 * Runs around every request: `next()` runs the rest — the `onRequest`
 * hooks, the route, the `onResponse` hooks — and resolves to the response.
 * What the hook awaits around it runs in its async context: a span, a
 * transaction, a timer.
 */
export type AroundHook = (
	ctx: RequestContext,
	next: () => Promise<Response>,
) => Promise<Response>;
export type StartHook = (server: Bun.Server<unknown>) => MaybePromise<void>;
export type StopHook = () => MaybePromise<void>;

/** A route as the app runs it: its schema, its handler, and the hooks declared before it. */
export interface RouteDefinition {
	readonly method: Method;
	readonly path: string;
	/**
	 * What it validates and answers: its schema, or the schemas of its
	 * `validate` and `responds` middlewares and its options. What
	 * `@alxia/openapi` documents; the chain runs `derive`.
	 */
	readonly schema: RouteSchema;
	/**
	 * The most bytes its request body may hold: its schema's `bodyLimit`,
	 * else the `bodyLimit` in effect where it was declared. None, no limit
	 * beyond the server's `maxRequestBodySize`.
	 */
	readonly bodyLimit?: number;
	readonly handler: (ctx: never) => MaybePromise<AnyReply>;
	/**
	 * Its chain, run before its handler: the hooks in force where it was
	 * declared, then its own list, middlewares and validation.
	 */
	readonly derive: readonly ChainHook[];
	readonly onError: readonly ErrorHook[];
	/** The `onRefusal` hook declared last before it; none, and a refused request is the default 400. */
	readonly refusal?: RefusalHandler | undefined;
	/** The `onRefusal(kind, hook)` hooks in force for it, tried before `refusal`. */
	readonly refusalByKind?: RefusalHandlersByKind | undefined;
}

/** A socket route as the app runs it. */
export interface SocketDefinition {
	readonly path: string;
	readonly schema: SocketSchema;
	readonly handlers: SocketHandlers<never, never, never>;
	readonly derive: readonly ChainHook[];
	readonly onError: readonly ErrorHook[];
	/** Answers a refused upgrade request, as a route's. */
	readonly refusal?: RefusalHandler | undefined;
	/** Answers a refused upgrade request of one kind, as a route's. */
	readonly refusalByKind?: RefusalHandlersByKind | undefined;
}

export type Definition =
	| ({ readonly kind: 'http' } & RouteDefinition)
	| ({ readonly kind: 'ws' } & SocketDefinition);

/** What is global to an app, wherever it is declared: a group's or a plugin's included. */
export interface Globals {
	readonly around: AroundHook[];
	readonly onRequest: RequestHook[];
	readonly onResponse: ResponseHook[];
	readonly onStart: StartHook[];
	readonly onStop: StopHook[];
	readonly parsers: BodyParser[];
	/** Bun's HTML bundles, by their full path: served by `Bun.serve` itself. */
	readonly pages: Map<string, Bun.HTMLBundle>;
}

/** What a request reads of an app: its routes, its global hooks, its options. */
export interface Runtime {
	readonly router: Router<Definition>;
	/** Shared with the app's groups, whose global hooks are the app's. */
	readonly globals: Globals;
	readonly validateResponses: boolean;
	/** The `ip` option, or the address of the connection. */
	readonly ip: (
		request: Request,
		server: Bun.Server<unknown> | undefined,
	) => string | undefined;
}
