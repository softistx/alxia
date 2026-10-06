/**
 * Under `react-router dev`: a request Vite left, answered by the server,
 * loaded through the ssr environment's module runner.
 */
import type { ViteDevServer } from 'vite';
import { DEFAULT, SERVER, serverFile } from './config';
import { NAME } from './entry';
import { send, toRequest } from './node';
import { bridgeSockets } from './socket';

/** What the dev server module exports: the alxia app, as `server.create` made it. */
export interface DevApp {
	fetch(request: Request, server?: Bun.Server<unknown>): Promise<Response>;
	readonly websocket: Bun.WebSocketHandler<never>;
}

/**
 * The app, as the server file is now: the runner keeps the module until an
 * edit invalidates it, so an edit is a new app.
 */
export async function loadApp(
	server: ViteDevServer,
	entry: string | undefined,
): Promise<DevApp> {
	// Duck-typed rather than Vite's `isRunnableDevEnvironment`: the app's
	// Vite may be another copy than the one this package would import.
	const runner = (
		server.environments.ssr as
			| { readonly runner?: { readonly import?: unknown } }
			| undefined
	)?.runner;
	if (typeof runner?.import !== 'function') {
		throw new Error(
			`${NAME}: Vite's ssr environment does not run modules in this process, so the server cannot be loaded.`,
		);
	}
	// Chosen on each request: a server file created or deleted while the
	// dev server runs is used from the next one.
	const id = serverFile(entry, server.config) === undefined ? DEFAULT : SERVER;
	const module = (await (runner.import as (id: string) => Promise<unknown>)(
		id,
	)) as { readonly default: DevApp };
	return module.default;
}

/** The side server of an app, which its sockets are open on: what `bridgeSockets` returns. */
export type SideOf = (app: DevApp) => Bun.Server<unknown> | undefined;

/**
 * One request Vite left, answered by the app as the server file is now,
 * given the side server its sockets are open on as `ctx.server`.
 */
export async function serveFromEntry(
	server: ViteDevServer,
	entry: string | undefined,
	sideOf: SideOf,
	req: Parameters<typeof toRequest>[0],
	res: Parameters<typeof toRequest>[1],
): Promise<void> {
	const app = await loadApp(server, entry);
	await send(res, await app.fetch(toRequest(req, res), sideOf(app)));
}

/**
 * `react-router dev`: the app's sockets on Vite's server now, and, returned
 * for after Vite's own middlewares, every request Vite leaves to the app.
 */
export function serveDev(
	server: ViteDevServer,
	entry: string | undefined,
): () => void {
	const sideOf = bridgeSockets(server.httpServer, {
		proxy: server.config.server.proxy,
		load: () => loadApp(server, entry),
		logger: server.config.logger,
		fix: (error) => server.ssrFixStacktrace(error),
	});
	return () => {
		server.middlewares.use((req, res, next) => {
			serveFromEntry(server, entry, sideOf, req, res).catch(
				(error: unknown) => {
					if (error instanceof Error) server.ssrFixStacktrace(error);
					next(error);
				},
			);
		});
	};
}
