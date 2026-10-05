/**
 * An app served by `Bun.serve`: its paths given to Bun's own router, its
 * pages served by Bun, its `onStart` hooks run once it listens, and its
 * graceful shutdown — on `SIGINT` and `SIGTERM`, or `stop()` — run once.
 */
import { formatRoutes, routeRows } from '../dev/route-table';
import type { Runtime } from './definition';
import { serve } from './pipeline';
import { onSignals, SIGNALS } from './signals';
import type { ListenOptions } from './signatures';
import type { SocketData } from './socket';

/** How long the requests in flight have to finish once shutdown starts, by default. */
export const SHUTDOWN_TIMEOUT = 10_000;

/** A server `listen` started, and how it shuts down: once, however often it is asked. */
export interface Serving {
	readonly server: Bun.Server<unknown>;
	/** Shuts down, as `stop()` describes; the same promise for every call, a forced one cutting the drain short. */
	stop(force: boolean): Promise<void>;
}

/**
 * Starts `Bun.serve` with the app, installs its signal handlers, then
 * runs every `onStart` hook: a supervisor that signals as soon as it reads
 * that the app listens finds the handlers in place.
 */
export function startServer(
	runtime: Runtime,
	options: ListenOptions | number,
	websocket: Bun.WebSocketHandler<SocketData>,
): Serving {
	const {
		signals = SIGNALS,
		shutdownTimeout = SHUTDOWN_TIMEOUT,
		onListen,
		...settings
	} = typeof options === 'number' ? { port: options } : options;
	if (!(Number.isFinite(shutdownTimeout) && shutdownTimeout >= 0)) {
		throw new TypeError(
			`listen(): shutdownTimeout must be a number of milliseconds, 0 or more; got ${String(shutdownTimeout)}`,
		);
	}
	if (runtime.served.closing.signal.aborted) {
		runtime.served.closing = new AbortController();
	}
	const server = Bun.serve({
		...settings,
		routes: routesOf(runtime),
		fetch: (request: Request, server: Bun.Server<unknown>) =>
			serve(runtime, request, server, undefined),
		websocket,
	} as Bun.Serve.Options<SocketData>) as Bun.Server<unknown>;
	let stopping: Promise<void> | undefined;
	let release = () => {};
	const serving: Serving = {
		server,
		stop(force) {
			// Forced while a graceful drain runs: its connections close now.
			if (stopping !== undefined && force) void server.stop(true);
			stopping ??= shutdown(
				runtime,
				server,
				force ? 0 : shutdownTimeout,
			).finally(() => release());
			return stopping;
		},
	};
	if (signals !== false) {
		release = onSignals(signals, () => serving.stop(false));
	}
	announce(runtime, server, onListen);
	for (const hook of runtime.globals.onStart) {
		Promise.resolve()
			.then(() => hook(server))
			.catch((error) => console.error(error));
	}
	return serving;
}

/**
 * What `listen` says once the app listens: `onListen`, given, is told
 * the URL and the routes, in every mode; else, in dev alone, the route
 * table is printed.
 */
function announce(
	runtime: Runtime,
	server: Bun.Server<unknown>,
	onListen: ListenOptions['onListen'],
): void {
	if (onListen === undefined && runtime.served.dev !== true) return;
	const routes = routeRows(runtime);
	const table = formatRoutes(server.url, routes);
	if (onListen === undefined) {
		console.log(table);
		return;
	}
	try {
		const dev = runtime.served.dev === true;
		onListen({ server, url: server.url, routes, table, dev });
	} catch (error) {
		console.error(error);
	}
}

/**
 * Stops the server `serving` holds, gracefully; with none, runs every
 * `onStop` hook, as a `stop()` before `listen` always has.
 */
export async function stopServer(
	runtime: Runtime,
	serving: Serving | undefined,
	force: boolean,
): Promise<void> {
	if (serving !== undefined) return serving.stop(force);
	for (const hook of runtime.globals.onStop) await hook();
}

/**
 * A graceful shutdown, in order: readiness turns 503 and the streams of
 * events end (`shutdownSignal`); new connections are refused; every open
 * socket is closed with 1001, going away; the requests in flight finish,
 * for `timeout` milliseconds at most, then the server closes what is
 * left; every `onStop` hook runs, each awaited in turn.
 */
async function shutdown(
	runtime: Runtime,
	server: Bun.Server<unknown>,
	timeout: number,
): Promise<void> {
	runtime.served.closing.abort();
	const drained = server.stop(false);
	for (const socket of runtime.sockets) socket.close(1001, 'going away');
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<boolean>((resolve) => {
		timer = setTimeout(() => resolve(true), timeout);
	});
	if (await Promise.race([drained.then(() => false), late])) {
		await server.stop(true);
	}
	clearTimeout(timer);
	for (const hook of runtime.globals.onStop) await hook();
}

type Routes = Record<
	string,
	| Bun.HTMLBundle
	| ((request: Request, server: Bun.Server<unknown>) => Promise<Response>)
>;

/** Each declared path for Bun's own router, and each HTML page. */
function routesOf(runtime: Runtime): Routes {
	const routes: Routes = {};
	for (const [path] of runtime.router.paths()) {
		const routed = runtime.router.isFixed(path) ? path : undefined;
		routes[path] = (request, server) => serve(runtime, request, server, routed);
	}
	for (const [path, bundle] of runtime.globals.pages) {
		routes[path] = bundle;
	}
	return routes;
}
