/**
 * `graphql-ws`'s server options for a socket route: each operation parsed,
 * validated, executed and subscribed through the endpoint's Yoga, and
 * followed to its end for the observers around the upgrade.
 */
import type { BaseContext } from '@alxia/core';
import type { ServerOptions, SubscribePayload } from 'graphql-ws';
import type { YogaInitialContext, YogaServerInstance } from 'graphql-yoga';
import { serverContext, type YogaContext } from './handler';
import { following, type SocketOperations } from './ws-operations';

/**
 * What `graphql-ws` keeps of each socket: the context its upgrade built,
 * the request each of its operations reads as Yoga's `request`, and its
 * operations, told to the upgrade's observers.
 */
export interface Extra {
	readonly ctx: Record<string, unknown> & BaseContext;
	readonly request: Request;
	readonly operations: SocketOperations;
}

/** The rest of each operation, run by the functions Yoga's envelop gave it. */
interface Enveloped {
	readonly execute: (args: never) => unknown;
	readonly subscribe: (args: never) => unknown;
}

/** Where the socket route is, and the endpoint whose Yoga it runs. */
export interface Paths {
	readonly endpoint: string;
	readonly socket: string;
}

/**
 * The Yoga of the endpoint a socket route serves: the HTTP one, so its
 * plugins are set up once. The socket's route is its full path, the
 * prefix of each app it is mounted into included, then its own `path`.
 */
function endpointOf(route: string, paths: Paths): string {
	// A path of `/` adds nothing to a prefix: `/api` + `/` is `/api`.
	const own = paths.socket === '/' ? '' : paths.socket;
	const at = paths.endpoint === '/' ? '' : paths.endpoint;
	return route.slice(0, route.length - own.length) + at || '/';
}

/**
 * `graphql-ws`'s options: each operation parsed, validated, executed and
 * subscribed through Yoga's envelop, with the context the upgrade built,
 * the operation's `params` and the client's `connectionParams`.
 */
export function serverOptions<UserCtx extends YogaContext>(
	yogaAt: (endpoint: string) => YogaServerInstance<YogaContext, UserCtx>,
	paths: Paths,
): ServerOptions<Record<string, unknown> | undefined, Extra> {
	// Each operation's envelop, found by its context: one object per
	// operation, which the root resolvers' `parent` is not.
	const enveloped = new WeakMap<object, Enveloped>();
	const of = (args: { contextValue?: unknown }) =>
		enveloped.get(args.contextValue as object) as Enveloped;
	return {
		execute: (args) => of(args).execute(args as never) as never,
		subscribe: (args) => of(args).subscribe(args as never) as never,
		...following<Extra>(),
		async onSubscribe(context, id, params: SubscribePayload) {
			const { ctx, request } = context.extra;
			const initial = {
				...serverContext(ctx),
				request,
				params,
				connectionParams: context.connectionParams,
			} as unknown as YogaInitialContext & YogaContext;
			const { schema, execute, subscribe, contextFactory, parse, validate } =
				yogaAt(endpointOf(ctx.route as string, paths)).getEnveloped(initial);
			let document: ReturnType<typeof parse>;
			try {
				document = parse(params.query);
			} catch (error) {
				return [error as never];
			}
			context.extra.operations.begin(id, document, params.operationName);
			const errors = validate(schema, document);
			if (errors.length > 0) return errors;
			const contextValue = await contextFactory();
			enveloped.set(contextValue, { execute, subscribe });
			return {
				schema,
				document,
				operationName: params.operationName,
				variableValues: params.variables,
				contextValue,
			};
		},
	};
}
