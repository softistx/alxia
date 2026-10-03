/**
 * An app served by `Bun.serve`: its paths given to Bun's own router, its
 * pages served by Bun, its `onStart` and `onStop` hooks run around it.
 */
import type { Runtime } from './definition';
import { serve } from './pipeline';
import type { ListenOptions } from './signatures';
import type { SocketData } from './socket';

/** Starts `Bun.serve` with the app, then runs every `onStart` hook. */
export function startServer(
	runtime: Runtime,
	options: ListenOptions | number,
	websocket: Bun.WebSocketHandler<SocketData>,
): Bun.Server<unknown> {
	const settings = typeof options === 'number' ? { port: options } : options;
	const routes: Record<
		string,
		| Bun.HTMLBundle
		| ((request: Request, server: Bun.Server<unknown>) => Promise<Response>)
	> = {};
	for (const [path] of runtime.router.paths()) {
		const routed = runtime.router.isFixed(path) ? path : undefined;
		routes[path] = (request, server) => serve(runtime, request, server, routed);
	}
	for (const [path, bundle] of runtime.globals.pages) {
		routes[path] = bundle;
	}
	const server = Bun.serve({
		...settings,
		routes,
		fetch: (request: Request, server: Bun.Server<unknown>) =>
			serve(runtime, request, server, undefined),
		websocket,
	} as Bun.Serve.Options<SocketData>) as Bun.Server<unknown>;
	for (const hook of runtime.globals.onStart) {
		Promise.resolve()
			.then(() => hook(server))
			.catch((error) => console.error(error));
	}
	return server;
}

/** Stops `server`, when there is one, then runs every `onStop` hook. */
export async function stopServer(
	runtime: Runtime,
	server: Bun.Server<unknown> | undefined,
	closeActiveConnections: boolean,
): Promise<void> {
	if (server !== undefined) await server.stop(closeActiveConnections);
	for (const hook of runtime.globals.onStop) await hook();
}
