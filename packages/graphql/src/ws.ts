/**
 * GraphQL over WebSocket, the `graphql-transport-ws` protocol of
 * `graphql-ws`, on a socket route of the app: the upgrade runs the app's
 * middlewares, each operation runs through Yoga's envelop — its plugins,
 * its `context` — and is told to the observers around the upgrade
 * (`ws-operations.ts`, through `ws-server.ts`'s options), and the app's shutdown closes the sockets with 1001.
 */
import type { BaseContext, NextFunction, RoutePath, Socket } from '@alxia/core';
import type { Server } from 'graphql-ws';
import type { YogaServerInstance } from 'graphql-yoga';
import type { YogaContext } from './handler';
import { SocketOperations } from './ws-operations';
import { type Extra, type Paths, serverOptions } from './ws-server';

/** `graphql(app, { ws })`: GraphQL over WebSocket beside the HTTP endpoint. */
export interface GraphQLWsOptions {
	/**
	 * Where a client opens its socket, under the app's prefix. The
	 * endpoint's own path by default: one URL, `http(s)://` for queries and
	 * server-sent events, `ws(s)://` for the socket.
	 */
	readonly path?: RoutePath;
	/**
	 * Milliseconds between the WebSocket pings the server sends each open
	 * socket, so a proxy does not close an idle subscription. `12_000` by
	 * default, as `graphql-ws`'s own server for Node; `false` for none.
	 */
	readonly keepAlive?: number | false;
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

/** `keepAlive` checked where `graphql()` is declared: a positive number of milliseconds, or `false`. */
function pingEvery(keepAlive: number | false | undefined): number | false {
	if (keepAlive === undefined) return 12_000;
	if (keepAlive === false) return false;
	if (Number.isFinite(keepAlive) && keepAlive > 0) return keepAlive;
	throw new TypeError(
		`graphql(app, { ws: { keepAlive: ${keepAlive} } }): keepAlive is the milliseconds between pings, a positive number, or false for none`,
	);
}

/** What one socket holds: the message handler `graphql-ws` registered, its end, its pings. */
interface Client {
	onMessage?: (data: string) => Promise<void>;
	closed?: (code?: number, reason?: string) => Promise<void>;
	pings?: ReturnType<typeof setInterval>;
	readonly gone: AbortController;
	readonly operations: SocketOperations;
}

/**
 * The socket route's middleware and handlers: the upgrade loads
 * `graphql-ws` and names the subprotocol it serves in the `101`; each
 * open socket is a `graphql-ws` client, ended when it closes.
 */
export function graphqlSocket<UserCtx extends YogaContext>(
	yogaAt: (endpoint: string) => YogaServerInstance<YogaContext, UserCtx>,
	endpoint: string,
	options: GraphQLWsOptions,
) {
	const paths: Paths = { endpoint, socket: options.path ?? endpoint };
	const keepAlive = pingEvery(options.keepAlive);
	const load = loader();
	let module: Module | undefined;
	let server: Server<Extra> | undefined;
	const clients = new WeakMap<object, Client>();

	// Named `graphqlWs`, the name the route table shows.
	async function graphqlWs(ctx: BaseContext, next: NextFunction) {
		module ??= await load();
		server ??= module.makeServer(serverOptions(yogaAt, paths));
		const protocol = chosen(module, ctx.request);
		if (protocol !== '')
			ctx.set.headers.set('sec-websocket-protocol', protocol);
		return next();
	}

	type GraphQLSocket = Socket<Record<string, unknown> & BaseContext, unknown>;
	const handlers = {
		open(socket: GraphQLSocket) {
			const raw = socket.raw;
			const client: Client = {
				gone: new AbortController(),
				operations: new SocketOperations(socket.data),
			};
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
					operations: client.operations,
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
			client.operations.closed();
		},
	};
	return { path: paths.socket, middleware: graphqlWs, handlers };
}
