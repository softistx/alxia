import type {
	Alxia,
	AnyReply,
	BaseContext,
	Empty,
	RoutePath,
} from '@alxia/core';
import type {
	GraphQLSchemaWithContext,
	YogaInitialContext,
	YogaServerOptions,
} from 'graphql-yoga';
import { graphqlHandler, type YogaContext, yogaServers } from './handler';
import type { SandboxOptions } from './sandbox';

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
 * What alxia hands Yoga for each request: the context its hooks built —
 * `user`, `db`, `log`… — with `request`, `url`, `ip` and `set`, through
 * which a resolver sets a cookie or a header on the response.
 */
export type ServerContext<Ctx> = Omit<BaseContext & Ctx, RouteOnly>;

/**
 * What a resolver reads as its context: Yoga's own, the app's, and what
 * the `context` option adds. Type a schema with it:
 *
 * ```ts
 * const base = alxia().use(bearer({ jwt }));
 * const schema = createSchema<GraphQLContext<typeof base>>({ ... });
 * ```
 */
export type GraphQLContext<App, UserContext = Empty> = App extends {
	readonly '~context': infer Ctx;
}
	? YogaInitialContext & ServerContext<Ctx> & UserContext
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
	 * or nothing. GraphiQL by default; turn both off in production.
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
	 * reads `user` behind no hook that derives one is a compile error.
	 */
	readonly schema: GraphQLSchemaWithContext<SchemaCtx>;
	/** Where the endpoint is, under the app's prefix. `/graphql` by default. */
	readonly path?: Path;
	/**
	 * Yoga's own CORS. Off by default: `@alxia/cors` answers for the whole
	 * app, this endpoint included.
	 */
	readonly cors?: YogaServerOptions<ServerCtx, UserCtx>['cors'];
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
 * `GET` and `POST` at `path`, behind every hook declared on `app` before it.
 * A guard before it guards it; what the hooks derived is in each
 * resolver's context, typed. Yoga's options pass through — `plugins`
 * (Envelop's and Yoga's), `graphiql`, `maskedErrors`, `batching`… —
 * and subscriptions are served over server-sent events.
 *
 * ```ts
 * const app = alxia()
 *   .use(bearer({ jwt }))
 *   .use((app) => graphql(app, { schema, plugins: [useDepthLimit()] }));
 * ```
 */
export function graphql<
	Ctx extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
	SchemaCtx,
	UserCtx extends YogaContext = Empty,
	const Path extends RoutePath = '/graphql',
>(
	app: Alxia<Ctx, Prefix, Shortcuts>,
	options: GraphQLOptions<ServerContext<Ctx>, UserCtx, Path, SchemaCtx> &
		ProvidesContext<
			YogaInitialContext & ServerContext<Ctx> & UserCtx,
			SchemaCtx
		>,
): Alxia<Ctx, Prefix, Shortcuts> {
	const {
		path = '/graphql' as Path,
		cors = false,
		ide = 'graphiql',
		graphiql,
		sandbox,
		...yogaOptions
	} = options;
	const yogaAt = yogaServers<UserCtx>({
		...(yogaOptions as YogaServerOptions<YogaContext, UserCtx>),
		cors,
		graphiql: (ide === 'graphiql'
			? (graphiql ?? true)
			: false) as YogaServerOptions<YogaContext, UserCtx>['graphiql'],
	});
	const handler = graphqlHandler(
		yogaAt,
		ide === 'apollo-sandbox' ? (sandbox ?? {}) : false,
	);

	const route = app as unknown as {
		get(path: string, handler: unknown): unknown;
		post(path: string, handler: unknown): unknown;
	};
	route.get(path, handler);
	route.post(path, handler);
	return app as never;
}
