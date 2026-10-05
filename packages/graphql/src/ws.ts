/**
 * GraphQL over WebSocket, the `graphql-transport-ws` protocol of
 * `graphql-ws`, on a socket route of the app: the upgrade runs the app's
 * middlewares, each operation runs through Yoga's envelop — its plugins,
 * its `context` — and the app's shutdown closes the sockets with 1001.
 */
import type { BaseContext, NextFunction, Socket } from '@alxia/core';
import type { Server, ServerOptions, SubscribePayload } from 'graphql-ws';
import type { YogaInitialContext, YogaServerInstance } from 'graphql-yoga';
import { serverContext, type YogaContext } from './handler';

/** `graphql(app, { ws })`: GraphQL over WebSocket beside the HTTP endpoint. */
export interface GraphQLWsOptions {
	/**
	 * Where a client opens its socket, under the app's prefix. The
	 * endpoint's own path by default: one URL, `http(s)://` for queries and
	 * server-sent events, `ws(s)://` for the socket.
	 */
	readonly path?: string;
	/**
	 * Milliseconds between the WebSocket pings the server sends each open
	 * socket, so a proxy does not close an idle subscription. `12_000` by
	 * default, as `graphql-ws`'s own server for Node; `false` for none.
	 */
	readonly keepAlive?: number | false;
}

/**
 * What `graphql-ws` keeps of each socket: the context its upgrade built,
 * and the request each of its operations reads as Yoga's `request`.
 */
interface Extra {
	readonly ctx: Record<string, unknown> & BaseContext;
	readonly request: Request;
}

type Module = typeof import('graphql-ws');

/** What the missing optional peer is answered with: the package to add. */
export const MISSING_PEER =
	'@alxia/graphql: graphql(app, { ws }) serves GraphQL over WebSocket with the optional peer graphql-ws, which is not installed: bun add graphql-ws';

/** `graphql-ws`, imported once; a missing peer rejects with `MISSING_PEER`. */
function loader(): () => Promise<Module> {
	let loading: Promise<Module> | undefined;
	return () => {
		loading ??= import('graphql-ws').catch((cause: unknown) => {
			throw new Error(MISSING_PEER, { cause });
		});
		return loading;
	};
}

/** The rest of each operation, run by the functions Yoga's envelop gave it. */
interface Enveloped {
	readonly execute: (args: never) => unknown;
	readonly subscribe: (args: never) => unknown;
}

/**
 * `graphql-ws`'s options: each operation parsed, validated, executed and
 * subscribed through Yoga's envelop, with the context the upgrade built,
 * the operation's `params` and the client's `connectionParams`.
 */
function serverOptions<UserCtx extends YogaContext>(
	yogaAt: (endpoint: string) => YogaServerInstance<YogaContext, UserCtx>,
): ServerOptions<Record<string, unknown> | undefined, Extra> {
	return {
		execute: (args) =>
			(args.rootValue as Enveloped).execute(args as never) as never,
		subscribe: (args) =>
			(args.rootValue as Enveloped).subscribe(args as never) as never,
		async onSubscribe(context, _id, params: SubscribePayload) {
			const { ctx, request } = context.extra;
			const initial = {
				...serverContext(ctx),
				request,
				params,
				connectionParams: context.connectionParams,
			} as unknown as YogaInitialContext & YogaContext;
			const { schema, execute, subscribe, contextFactory, parse, validate } =
				yogaAt(ctx.route as string).getEnveloped(initial);
			let document: ReturnType<typeof parse>;
			try {
				document = parse(params.query);
			} catch (error) {
				return [error as never];
			}
			const errors = validate(schema, document);
			if (errors.length > 0) return errors;
			return {
				schema,
				document,
				operationName: params.operationName,
				variableValues: params.variables,
				contextValue: await contextFactory(),
				rootValue: { execute, subscribe } satisfies Enveloped,
			};
		},
	};
}

/** The subprotocol the upgrade request offers that `graphql-ws` serves, or `''`. */
function chosen(module: Module, request: Request): string {
	const offered = request.headers.get('sec-websocket-protocol') ?? '';
	return module.handleProtocols(offered) || '';
}

/**
 * The request an operation over the socket reads: the upgrade's URL and
 * headers, as a `POST`, which it is to Yoga — a `GET` may not run a
 * mutation, and the upgrade is one — its signal aborted when the socket
 * closes.
 */
function operationRequest(upgrade: Request, signal: AbortSignal): Request {
	return new Request(upgrade.url, {
		method: 'POST',
		headers: upgrade.headers,
		signal,
	});
}

/** What one socket holds: the message handler `graphql-ws` registered, its end, its pings. */
interface Client {
	onMessage?: (data: string) => Promise<void>;
	closed?: (code?: number, reason?: string) => Promise<void>;
	pings?: ReturnType<typeof setInterval>;
	readonly gone: AbortController;
}

/**
 * The socket route's middleware and handlers: the upgrade loads
 * `graphql-ws` and names the subprotocol it serves in the `101`; each
 * open socket is a `graphql-ws` client, ended when it closes.
 */
export function graphqlSocket<UserCtx extends YogaContext>(
	yogaAt: (endpoint: string) => YogaServerInstance<YogaContext, UserCtx>,
	options: GraphQLWsOptions,
) {
	const load = loader();
	let module: Module | undefined;
	let server: Server<Extra> | undefined;
	const clients = new WeakMap<object, Client>();
	const keepAlive = options.keepAlive ?? 12_000;

	// Named `graphqlWs`, the name the route table shows.
	async function graphqlWs(ctx: BaseContext, next: NextFunction) {
		module ??= await load();
		server ??= module.makeServer(serverOptions(yogaAt));
		const protocol = chosen(module, ctx.request);
		if (protocol !== '')
			ctx.set.headers.set('sec-websocket-protocol', protocol);
		return next();
	}

	type GraphQLSocket = Socket<Record<string, unknown> & BaseContext, unknown>;
	const handlers = {
		open(socket: GraphQLSocket) {
			const raw = socket.raw;
			const client: Client = { gone: new AbortController() };
			clients.set(raw, client);
			// The upgrade loaded both: a socket opens behind its middleware alone.
			const graphqlWsServer = server as NonNullable<typeof server>;
			client.closed = graphqlWsServer.opened(
				{
					// Anything else is closed by graphql-ws: 4406, Subprotocol not acceptable.
					protocol: chosen(module as Module, socket.data.request),
					send: (data: string) => {
						if (raw.readyState === 1) raw.sendText(data);
					},
					close: (code?: number, reason?: string) => raw.close(code, reason),
					onMessage: (handle: (data: string) => Promise<void>) => {
						client.onMessage = handle;
					},
				},
				{
					ctx: socket.data,
					request: operationRequest(socket.data.request, client.gone.signal),
				},
			);
			if (keepAlive !== false) {
				client.pings = setInterval(() => raw.ping(), keepAlive);
			}
		},
		async message(socket: GraphQLSocket, message: unknown) {
			const data =
				typeof message === 'string'
					? message
					: new TextDecoder().decode(message as Uint8Array);
			await clients.get(socket.raw)?.onMessage?.(data);
		},
		async close(socket: GraphQLSocket, code: number, reason: string) {
			const client = clients.get(socket.raw);
			if (client === undefined) return;
			clearInterval(client.pings);
			clients.delete(socket.raw);
			client.gone.abort();
			await client.closed?.(code, reason);
		},
	};
	return { middleware: graphqlWs, handlers };
}
