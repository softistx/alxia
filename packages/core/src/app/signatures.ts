/**
 * The options of an app and of its `listen`, and the types its methods are
 * written in.
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
	<Result extends Reply<ClientErrorStatus, any> | undefined | void>(
		hook: (refusal: Refusal, ctx: BaseContext & Ctx) => MaybePromise<Result>,
	): Alxia<
		Ctx,
		Routes,
		Prefix,
		Exclude<Shortcuts, Refusing> | RefusalsOf<Extract<Result, AnyReply>, Result>
	>;
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

export type { RouteMethod } from './route-method';
