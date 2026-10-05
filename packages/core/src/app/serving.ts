/**
 * An app served by `Bun.serve`: its paths given to Bun's own router, its
 * pages served by Bun, its `onStart` hooks run once it listens, and its
 * graceful shutdown — on `SIGINT` and `SIGTERM`, or `stop()` — run once.
 */
import { formatRoutes, routeRows } from '../dev/route-table';
import type { Runtime, StopHook } from './definition';
import { serve } from './pipeline';
import { onSignals, SIGNALS } from './signals';
import type { ListenOptions } from './signatures';
import type { SocketData } from './socket';

/** How long the requests in flight have to finish once shutdown starts, by default. */
export const SHUTDOWN_TIMEOUT = 10_000;
/** How long the `onStop` hooks have to finish, all of them, by default. */
export const STOP_TIMEOUT = 5_000;

/** A server `listen` started, and how it shuts down: once, however often it is asked. */
export interface Serving {
	readonly server: Bun.Server<unknown>;
	/** Shuts down, as `stop()` describes; the same promise for every call, a forced one cutting the drain short. */
	stop(force: boolean): Promise<void>;
	/** Whether its shutdown has started: `stop()`, or a signal. */
	readonly stopping: boolean;
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
		exit = true,
		shutdownTimeout = SHUTDOWN_TIMEOUT,
		stopTimeout = STOP_TIMEOUT,
		onListen,
		...settings
	} = typeof options === 'number' ? { port: options } : options;
	milliseconds('shutdownTimeout', shutdownTimeout);
	milliseconds('stopTimeout', stopTimeout);
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
			stopping ??= shutdown(runtime, server, {
				drain: force ? 0 : shutdownTimeout,
				hooks: stopTimeout,
			}).finally(() => release());
			return stopping;
		},
		get stopping() {
			return stopping !== undefined;
		},
	};
	if (signals !== false) {
		release = onSignals(signals, () => serving.stop(false), exit !== false);
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
	const dev = runtime.served.dev === true;
	const table = formatRoutes(server.url, routes, dev);
	if (onListen === undefined) {
		console.log(table);
		return;
	}
	try {
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
	await runStopHooks(runtime.globals.onStop, STOP_TIMEOUT);
}

/**
 * A graceful shutdown, in order: readiness turns 503 and the streams of
 * events end (`shutdownSignal`); new connections are refused; every open
 * socket is closed with 1001, going away; the requests in flight finish,
 * for `timeout` milliseconds at most, then the server closes what is
 * left; every `onStop` hook runs, each awaited in turn, all of them
 * within `timeout.hooks` milliseconds.
 */
async function shutdown(
	runtime: Runtime,
	server: Bun.Server<unknown>,
	timeout: { readonly drain: number; readonly hooks: number },
): Promise<void> {
	runtime.served.closing.abort();
	const drained = server.stop(false);
	for (const socket of runtime.sockets) socket.close(1001, 'going away');
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<boolean>((resolve) => {
		timer = setTimeout(() => resolve(true), timeout.drain);
	});
	if (await Promise.race([drained.then(() => false), late])) {
		await server.stop(true);
	}
	clearTimeout(timer);
	await runStopHooks(runtime.globals.onStop, timeout.hooks);
}

/**
 * Every `onStop` hook, each awaited in turn, within `timeout`
 * milliseconds for them all: past it, the shutdown fails naming the hook
 * still running, and the hooks after it are not run.
 */
async function runStopHooks(
	hooks: readonly StopHook[],
	timeout: number,
): Promise<void> {
	let index = 0;
	const run = (async () => {
		for (; index < hooks.length; index++) await (hooks[index] as StopHook)();
	})();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const late = new Promise<'late'>((resolve) => {
		timer = setTimeout(() => resolve('late'), timeout);
	});
	try {
		if ((await Promise.race([run, late])) !== 'late') return;
	} finally {
		clearTimeout(timer);
	}
	run.catch(() => {}); // a hook that fails after the timeout is not news
	const name = (hooks[index] as StopHook).name || 'anonymous';
	const left = hooks.length - index - 1;
	throw new Error(
		`onStop hook ${name} (${index + 1} of ${hooks.length}) did not finish within ${timeout} ms${left > 0 ? `; ${left} after it not run` : ''}: raise listen()'s stopTimeout, or make it settle`,
	);
}

/** A timeout of `listen`'s: a number of milliseconds, 0 or more, or it throws. */
function milliseconds(name: string, value: number): void {
	if (!(Number.isFinite(value) && value >= 0)) {
		throw new TypeError(
			`listen(): ${name} must be a number of milliseconds, 0 or more; got ${String(value)}`,
		);
	}
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
