import {
	type Alxia,
	type BaseContext,
	type Empty,
	isDev,
	type RoutePath,
} from '@alxia/core';
import type {
	GraphQLSchemaWithContext,
	YogaInitialContext,
	YogaServerOptions,
} from 'graphql-yoga';
import { declareEndpoint } from './endpoint';
import { graphqlHandler, type YogaContext, yogaServers } from './handler';
import { reportsOperations } from './operation';
import {
	limitsParsing,
	type ParseCacheOptions,
	parseCaches,
	resolveLimits,
} from './parse-limits';
import type { SandboxOptions } from './sandbox';
import { type GraphQLWsOptions, graphqlSocket } from './ws';

/** The parts of a route's context Yoga owns, or that mean nothing to a resolver. */
type RouteOnly =
	| 'params'
	| 'query'
	| 'headers'
	| 'cookies'
	| 'body'
	| 'reply'
	| 'redirect';

/**
 * What alxia hands Yoga for each request: the context its middlewares built —
 * `user`, `db`, `log`… — with `request`, `url`, `ip` and `set`, through
 * which a resolver sets a cookie or a header on the response.
 */
export type ServerContext<Ctx> = Omit<BaseContext & Ctx, RouteOnly>;

/**
 * What an operation over WebSocket adds to its context (`ws` on): the
 * `connectionParams` the client sent when it connected. `undefined` over
 * HTTP, and for a client that sent none.
 */
export interface GraphQLWsContext {
	readonly connectionParams?: Readonly<Record<string, unknown>>;
}

/**
 * What a resolver reads as its context: Yoga's own, the app's, what
 * the `context` option adds, and over WebSocket the `connectionParams`. Type a schema with it:
 *
 * ```ts
 * const base = alxia().use(bearer({ jwt }));
 * const schema = createSchema<GraphQLContext<typeof base>>({ ... });
 * ```
 */
export type GraphQLContext<App, UserContext = Empty> = App extends {
	readonly '~context': infer Ctx;
}
	? YogaInitialContext & ServerContext<Ctx> & GraphQLWsContext & UserContext
	: // Not `never`: a schema typed with `never` would let every resolver
		// read anything until `graphql()` refused it.
		{
			readonly '~error': 'GraphQLContext needs the type of an app: GraphQLContext<typeof app>';
		};

export interface GraphQLOptions<
	ServerCtx extends YogaContext,
	UserCtx extends YogaContext,
	Path extends RoutePath,
	SchemaCtx = unknown,
> extends Omit<
		YogaServerOptions<ServerCtx, UserCtx>,
		'graphqlEndpoint' | 'cors' | 'schema' | 'graphiql'
	> {
	/**
	 * What a browser gets at the endpoint: Yoga's GraphiQL, Apollo Sandbox,
	 * or nothing. By default, GraphiQL in the serving app's dev alone
	 * (`isDev`: `alxia({ dev })`, else `NODE_ENV=development`), nothing
	 * otherwise; `graphiql` or `apollo-sandbox` serves one everywhere.
	 */
	readonly ide?: 'graphiql' | 'apollo-sandbox' | false;
	/** GraphiQL's options, Yoga's own, when `ide` is `graphiql`. */
	readonly graphiql?: Exclude<
		YogaServerOptions<ServerCtx, UserCtx>['graphiql'],
		boolean
	>;
	/** Apollo Sandbox's options, when `ide` is `apollo-sandbox`. */
	readonly sandbox?: SandboxOptions;
	/**
	 * The schema, from Yoga's `createSchema`, Pothos, or any tool that types
	 * its context. Its context must be one the app builds: a resolver that
	 * reads `user` behind no middleware that adds one is a compile error.
	 */
	readonly schema: GraphQLSchemaWithContext<SchemaCtx>;
	/** Where the endpoint is, under the app's prefix. `/graphql` by default. */
	readonly path?: Path;
	/**
	 * Yoga's own CORS. Off by default: `@alxia/cors` answers for the whole
	 * app, this endpoint included.
	 */
	readonly cors?: YogaServerOptions<ServerCtx, UserCtx>['cors'];
	/**
	 * GraphQL over WebSocket too, the `graphql-transport-ws` protocol of
	 * Apollo Client's and urql's default link, served by the optional peer
	 * `graphql-ws` at the endpoint's path: `true`, or where and how often it
	 * pings. Off by default: subscriptions are served over server-sent
	 * events, which stay served beside it.
	 */
	readonly ws?: boolean | GraphQLWsOptions;
	/**
	 * The most tokens a document may hold, 15 000 by default (Apollo
	 * Router's own), or `false` for no cap. A longer document is refused by
	 * the parser before anything runs, as Yoga refuses any document it
	 * cannot parse: `GRAPHQL_PARSE_FAILED`.
	 */
	readonly maxTokens?: number | false;
	/**
	 * The most levels of `{`, `(` and `[` a document may nest, 1 000 by
	 * default, or `false` for no limit. A deeper document is refused before
	 * the parser recurses into it, as `GRAPHQL_PARSE_FAILED`: graphql-js
	 * overflows the stack a few thousand levels down, well under
	 * `maxTokens`. A document that overflows it anyway is refused the same
	 * way.
	 */
	readonly maxNesting?: number | false;
	/**
	 * The cache of parsed documents, one per endpoint, weighed by its tokens and bytes:
	 * `maxBytes` (64 MiB by default), `max` documents (1 024) and `ttl`
	 * milliseconds (one hour). `false` parses every request. Yoga's own
	 * `parserAndValidationCache` replaces it, and cannot be given with it.
	 */
	readonly parseCache?: false | ParseCacheOptions;
	/**
	 * The most bytes a `POST` body may hold, over which core answers a 413.
	 * Without it, the `bodyLimit()` the app declared before `graphql()`
	 * applies as it is; without that, 1 MiB. An upload through a
	 * `multipart` mutation needs a larger one.
	 */
	readonly bodyLimit?: number;
}

/**
 * The check Yoga's types leave out: the context the app builds must hold
 * what the schema's resolvers read. A mistake comes back as a `schema`
 * whose type is the message.
 */
type ProvidesContext<Provided, Required> = Provided extends Required
	? unknown
	: {
			readonly schema: `the schema's resolvers read a context the app does not build: missing ${Exclude<
				keyof Required,
				keyof Provided
			> &
				string}`;
		};

/**
 * A GraphQL endpoint on `app`, served by [GraphQL Yoga](https://the-guild.dev/graphql/yoga-server):
 * `GET` and `POST` at `path`, behind every middleware given to `use` on `app`
 * before it. A guard before it guards it; what the middlewares added is in each
 * resolver's context, typed. Yoga's options pass through — `plugins`
 * (Envelop's and Yoga's), `graphiql`, `maskedErrors`, `batching`… —
 * and subscriptions are served over server-sent events, and over
 * WebSocket too with `ws: true`.
 *
 * ```ts
 * const app = alxia()
 *   .use(bearer({ jwt }))
 *   .plugin((app) => graphql(app, { schema, plugins: [useDepthLimit()] }));
 * ```
 */
export function graphql<
	Ctx extends object,
	Prefix extends string,
	SchemaCtx,
	UserCtx extends YogaContext = Empty,
	const Path extends RoutePath = '/graphql',
>(
	app: Alxia<Ctx, Prefix>,
	options: GraphQLOptions<ServerContext<Ctx>, UserCtx, Path, SchemaCtx> &
		ProvidesContext<
			YogaInitialContext & ServerContext<Ctx> & UserCtx,
			SchemaCtx
		>,
): Alxia<Ctx, Prefix> {
	const {
		path = '/graphql' as Path,
		cors = false,
		ide,
		graphiql,
		sandbox,
		ws = false,
		maxTokens,
		maxNesting,
		parseCache,
		bodyLimit,
		...yogaOptions
	} = options;
	const limits = resolveLimits(maxTokens, maxNesting, parseCache, yogaOptions);
	const page = graphiql ?? true;
	const yogaAt = yogaServers<UserCtx>(
		{
			// Yoga 6 only: the options are unknown to Yoga 5 and ignored there.
			// The app issues its own request id, so a client-sent `x-request-id`
			// is never echoed nor logged; and Yoga 6's per-request INFO line
			// stays off unless the app asks for `logging: true` or 'info'.
			...(yogaOptions as YogaServerOptions<YogaContext, UserCtx>),
			...(yogaOptions.logging === undefined ? { logging: 'warn' } : {}),
			...untrustedRequestId(yogaOptions),
			plugins: [
				limitsParsing(limits.tokens, limits.depth),
				...(yogaOptions.plugins ?? []),
				reportsOperations(),
			],
			cors,
			graphiql: (ide === undefined
				? (_request: Request, context: object) => isDev(context) && page
				: ide === 'graphiql'
					? page
					: false) as YogaServerOptions<YogaContext, UserCtx>['graphiql'],
		},
		yogaOptions.parserAndValidationCache === undefined
			? () => parseCaches(parseCache)
			: undefined,
	);
	const handler = graphqlHandler(
		yogaAt,
		ide === 'apollo-sandbox' ? (sandbox ?? {}) : false,
	);

	declareEndpoint(
		app as never,
		path,
		handler,
		bodyLimit,
		ws === false
			? undefined
			: graphqlSocket(yogaAt, path, ws === true ? {} : ws),
	);
	return app as never;
}

/**
 * Yoga 6 reads the client's `x-request-id`, answers with it and tags its
 * logger with it: log forging. Off by default (the app issues its own id);
 * an app that turns Yoga's id on keeps `trustHeader: false` unless it sets it.
 */
function untrustedRequestId(options: object): object {
	const { requestId } = options as { requestId?: unknown };
	if (requestId === undefined) return { requestId: false };
	if (requestId === true) return { requestId: { trustHeader: false } };
	if (typeof requestId === 'object' && requestId !== null) {
		return { requestId: { trustHeader: false, ...requestId } };
	}
	return {};
}
