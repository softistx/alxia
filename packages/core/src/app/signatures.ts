/**
 * The options of an app and of its `listen`, the types its methods are
 * written in, and what a type reads of an app.
 */
import type { Refusal, RefusalKind, RefusalOfKind } from '../errors/errors';
import type { AnyReply, Reply } from '../reply/reply';
import type { ClientErrorStatus } from '../types/status';
import type { Alxia } from './alxia';
import type {
	BaseContext,
	DeclaredRefusal,
	DeclaredReply,
	KindRefusalsOf,
	MaybePromise,
	OneKind,
	RefusalResponses,
	RefusalSchema,
	RefusalsOf,
	Refusing,
	RefusingKind,
	TypedReplyFunction,
} from './types';

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
export type AnyAlxia = Alxia<any, any, any, any>;

/**
 * A plugin written as a function: it receives the app and returns it, with
 * global hooks added. A plugin that adds to the context or declares routes
 * is an app of its own, given to `use`.
 */
export type Plugin = <App extends AnyAlxia>(app: App) => App;

/**
 * `app.onRefusal`: `onRefusal(hook)` or `onRefusal(schema, hook)` for every
 * kind of refusal, `onRefusal(kind, hook)` or `onRefusal(kind, schema,
 * hook)` for one.
 */
export interface RefusalMethod<
	Ctx extends object,
	Routes extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
	/**
	 * A hook that answers a request a route declared after it refuses
	 * before its handler runs: one its schemas refuse, the default of which
	 * is `400 { error: 'validation', issues }`, or one whose body passes its
	 * `bodyLimit`, the default of which is
	 * `413 { error: 'content_too_large', limit }`. The hook reads
	 * the refusal — its `kind`: `validation`, with the `part` that failed
	 * and the `issues`, or `body_limit`, with the route's `limit` — and
	 * returns a reply with a 4xx status, or nothing for that kind's default.
	 * The last one declared before a route is the one in force; a group's
	 * stays inside it. Its reply replaces the default 400 in the type of
	 * every such route that validates, so the client reads it:
	 *
	 * ```ts
	 * .onRefusal((refusal) => refusal.kind === 'validation'
	 *   ? problem({ type: 'urn:example:invalid', status: 400, detail: `the ${refusal.part} is invalid` })
	 *   : problem({ type: 'urn:example:limit', status: 413, limit: refusal.limit }))
	 * ```
	 *
	 * Given schemas first, its `reply` is typed by them, its reply is
	 * checked and sent as their output, and `@alxia/openapi` documents it:
	 *
	 * ```ts
	 * .onRefusal({ response: { 400: Problem }, contentType: 'application/problem+json' },
	 *   (refusal, { reply }) => reply(400, { type: 'urn:example:invalid', status: 400, detail: refusal.kind }))
	 * ```
	 *
	 * Given a kind first, the hook answers that kind alone and reads it
	 * narrowed; its schemas, if any, type and document that kind's replies
	 * apart. A kind with no hook of its own, or whose hook returns nothing,
	 * falls back to the general hook, then to the default. A general hook
	 * declared after it replaces it; one of the same kind too:
	 *
	 * ```ts
	 * .onRefusal('validation', { response: { 400: Invalid } }, (refusal, { reply }) =>
	 *   reply(400, { detail: `the ${refusal.part} is invalid` }))
	 * .onRefusal('body_limit', { response: { 413: TooLarge } }, (refusal, { reply }) =>
	 *   reply(413, { limit: refusal.limit }))
	 * ```
	 */
	<Result extends Reply<ClientErrorStatus, any> | undefined | void>(
		hook: (refusal: Refusal, ctx: BaseContext & Ctx) => MaybePromise<Result>,
	): Alxia<
		Ctx,
		Routes,
		Prefix,
		Exclude<Shortcuts, Refusing> | RefusalsOf<Extract<Result, AnyReply>, Result>
	>;
	/** The hook answering every kind of refusal, its replies typed by `schema`. */
	<
		Responses extends RefusalResponses,
		Result extends DeclaredReply<Responses> | undefined | void,
	>(
		schema: RefusalSchema<Responses>,
		hook: (
			refusal: Refusal,
			ctx: Omit<BaseContext, 'reply'> &
				Ctx & { readonly reply: TypedReplyFunction<Responses> },
		) => MaybePromise<Result>,
	): Alxia<
		Ctx,
		Routes,
		Prefix,
		| Exclude<Shortcuts, Refusing>
		| RefusalsOf<DeclaredRefusal<Responses>, Result>
	>;
	/** The hook answering one `kind` of refusal, read narrowed. */
	<
		Kind extends RefusalKind,
		Result extends Reply<ClientErrorStatus, any> | undefined | void,
	>(
		kind: Kind & OneKind<Kind>,
		hook: (
			refusal: RefusalOfKind<Kind>,
			ctx: BaseContext & Ctx,
		) => MaybePromise<Result>,
	): Alxia<
		Ctx,
		Routes,
		Prefix,
		| Exclude<Shortcuts, RefusingKind<Kind>>
		| KindRefusalsOf<Kind, Extract<Result, AnyReply>, Result>
	>;
	/** The hook answering one `kind` of refusal, its replies typed by `schema`. */
	<
		Kind extends RefusalKind,
		Responses extends RefusalResponses,
		Result extends DeclaredReply<Responses> | undefined | void,
	>(
		kind: Kind & OneKind<Kind>,
		schema: RefusalSchema<Responses>,
		hook: (
			refusal: RefusalOfKind<Kind>,
			ctx: Omit<BaseContext, 'reply'> &
				Ctx & { readonly reply: TypedReplyFunction<Responses> },
		) => MaybePromise<Result>,
	): Alxia<
		Ctx,
		Routes,
		Prefix,
		| Exclude<Shortcuts, RefusingKind<Kind>>
		| KindRefusalsOf<Kind, DeclaredRefusal<Responses>, Result>
	>;
}

/** The route table of an app, as the client reads it. */
export type RoutesOf<App> = App extends { readonly '~routes': infer Routes }
	? Routes
	: never;

/**
 * What a route declared next on `App` reads: the context its hooks build —
 * `decorate`, `derive`, every plugin's — on top of the base context. A
 * GraphQL schema, a service, types its own context with it.
 */
export type ContextOf<App> = App extends { readonly '~context': infer Ctx }
	? BaseContext & Ctx
	: never;
