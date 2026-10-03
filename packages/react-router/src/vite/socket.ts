/**
 * Under `react-router dev` and `vite preview`: the app's WebSocket routes. Vite's server is a
 * `node:http` one, and an alxia socket is `Bun.serve`'s upgrade, so each
 * upgrade Vite leaves is relayed, bytes as they come, to a `Bun.serve` of
 * the app's own on a loopback port: its hooks, its validation, its socket
 * handlers, exactly as `listen` runs them.
 */
import type { IncomingMessage } from 'node:http';
import { connect, type Socket } from 'node:net';
import type { DevApp } from './dev';
import { NAME } from './entry';

/** The subprotocols of Vite's own socket, the HMR one and its ping: Vite answers them. */
const VITE = new Set(['vite-hmr', 'vite-ping']);

/** Whether the upgrade asks for Vite's own socket. */
export function isVites(req: Pick<IncomingMessage, 'headers'>): boolean {
	const protocols = req.headers['sec-websocket-protocol'];
	if (protocols === undefined) return false;
	return protocols.split(',').some((protocol) => VITE.has(protocol.trim()));
}

/** One entry of Vite's `server.proxy`, as far as its sockets go. */
type ProxyEntry = string | { readonly ws?: boolean; readonly target?: unknown };

/**
 * Whether Vite's `server.proxy` relays this upgrade itself: an entry whose
 * context matches the URL, as Vite matches it (`^…` a RegExp, otherwise a
 * prefix), and that proxies sockets (`ws: true`, or a `ws:`/`wss:` target).
 */
export function isProxied(
	url: string,
	proxy: Readonly<Record<string, ProxyEntry>> | undefined,
): boolean {
	for (const [context, entry] of Object.entries(proxy ?? {})) {
		const matches =
			(context.startsWith('^') && new RegExp(context).test(url)) ||
			url.startsWith(context);
		if (!matches) continue;
		const options = typeof entry === 'string' ? { target: entry } : entry;
		const target = String(options.target ?? '');
		if (
			options.ws === true ||
			target.startsWith('ws:') ||
			target.startsWith('wss:')
		) {
			return true;
		}
	}
	return false;
}

/** The request line and headers of `req`, as they came: what the side server reads. */
export function head(
	req: Pick<IncomingMessage, 'method' | 'url' | 'rawHeaders'>,
): string {
	const lines = [`${req.method ?? 'GET'} ${req.url ?? '/'} HTTP/1.1`];
	const raw = req.rawHeaders;
	for (let i = 0; i + 1 < raw.length; i += 2) {
		lines.push(`${raw[i]}: ${raw[i + 1]}`);
	}
	return `${lines.join('\r\n')}\r\n\r\n`;
}

/** The side servers: the current app's, and those an edit retired, until their sockets close. */
export interface Sides {
	current:
		| { readonly app: DevApp; readonly side: Bun.Server<unknown> }
		| undefined;
	readonly retired: Set<Bun.Server<unknown>>;
}

/**
 * The side server of `app`, started on its first upgrade. A new app, an
 * edit's, retires the previous one: no new connection, and the sockets open
 * on it stay, with the handlers they opened with, until they close.
 */
export function sideFor(sides: Sides, app: DevApp): Bun.Server<unknown> {
	if (sides.current?.app === app) return sides.current.side;
	const side = Bun.serve({
		port: 0,
		hostname: '127.0.0.1',
		fetch: (request, bun) => app.fetch(request, bun),
		websocket: app.websocket,
	} as Bun.Serve.Options<never>) as Bun.Server<unknown>;
	const old = sides.current?.side;
	if (old !== undefined) {
		sides.retired.add(old);
		void old.stop().then(() => sides.retired.delete(old));
	}
	sides.current = { app, side };
	return side;
}

/** Stops every side server, open sockets and all: Vite's server closed. */
export function closeAll(sides: Sides): void {
	for (const side of [...sides.retired, sides.current?.side]) {
		void side?.stop(true);
	}
	sides.current = undefined;
	sides.retired.clear();
}

/** Relays the upgrade on `socket` to the side server on `port`, both ways. */
function relay(
	req: IncomingMessage,
	socket: Socket,
	bytes: Buffer,
	port: number,
): void {
	const upstream = connect(port, '127.0.0.1', () => {
		upstream.write(head(req));
		if (bytes.length > 0) upstream.write(bytes);
		upstream.pipe(socket);
		socket.pipe(upstream);
	});
	upstream.on('error', () => socket.destroy());
	upstream.on('close', () => socket.destroy());
	socket.on('close', () => upstream.destroy());
}

/** What the relay listens to on Vite's HTTP server, HTTP/1 or HTTP/2 alike. */
interface Upgrades {
	on(
		event: 'upgrade',
		listener: (req: IncomingMessage, socket: Socket, bytes: Buffer) => void,
	): unknown;
	once(event: 'close', listener: () => void): unknown;
}

/** What the relay needs of the server it listens on: Vite's dev server or its preview. */
export interface Bridge {
	/** Vite's `server.proxy` (or `preview.proxy`): the upgrades it relays are its own. */
	readonly proxy: Readonly<Record<string, ProxyEntry>> | undefined;
	/** The app, as it is now. */
	readonly load: () => Promise<DevApp>;
	/** Where an upgrade that failed is printed: Vite's logger. */
	readonly logger: { error(message: string): void };
	/** Maps an error's stack to the source, as Vite's `ssrFixStacktrace` does. */
	readonly fix?: (error: Error) => void;
}

/** An upgrade the app could not take: reported, and a 500 to the client. */
function refuse(bridge: Bridge, socket: Socket, error: unknown): void {
	if (error instanceof Error) bridge.fix?.(error);
	bridge.logger.error(
		`${NAME}: a WebSocket upgrade failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
	);
	if (socket.writable) {
		socket.end(
			'HTTP/1.1 500 Internal Server Error\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
		);
	}
}

/**
 * Relays the app's upgrades on Vite's HTTP server to a side server of the
 * app. Vite's own socket and the sockets its proxy relays are left to
 * Vite. Without an HTTP server (Vite's middleware mode), there is nothing
 * to listen on.
 */
export function bridgeSockets(http: Upgrades | null, bridge: Bridge): void {
	if (http === null) return;
	const sides: Sides = { current: undefined, retired: new Set() };
	http.on('upgrade', (req: IncomingMessage, socket: Socket, bytes: Buffer) => {
		if (isVites(req) || isProxied(req.url ?? '/', bridge.proxy)) return;
		socket.on('error', () => socket.destroy());
		bridge
			.load()
			.then((app) => {
				if (socket.destroyed) return;
				relay(req, socket, bytes, sideFor(sides, app).port as number);
			})
			.catch((error: unknown) => refuse(bridge, socket, error));
	});
	http.once('close', () => closeAll(sides));
}
