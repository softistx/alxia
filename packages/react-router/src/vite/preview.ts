/**
 * Under `vite preview`, and React Router's prerendering, which runs on it:
 * every request goes to the built server, `build/server/index.js`'s
 * default export, as `bun build/server/index.js` would answer it — its
 * middlewares, its `/api`, the client's files and the pages.
 */
import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PreviewServer } from 'vite';
import { serverBuildPath } from './config';
import type { DevApp } from './dev';
import { NAME } from './entry';
import { send, toRequest } from './node';
import { bridgeSockets } from './socket';

/** What the built server's default export is: the alxia app. */
interface Fetcher {
	fetch(request: Request): Response | Promise<Response>;
}

/** The built server's app, or an error saying why there is none. */
async function load(file: string, label: string): Promise<Fetcher> {
	if (!existsSync(file)) {
		throw new Error(
			`${NAME}: ${label} does not exist. Run react-router build before vite preview.`,
		);
	}
	const module = (await import(pathToFileURL(file).href)) as {
		readonly default?: Partial<Fetcher>;
	};
	if (typeof module.default?.fetch !== 'function') {
		throw new Error(
			`${NAME}: ${label} is not alxia's server: its default export has no fetch. Build it with alxia() in vite.config.ts's plugins, then run vite preview again.`,
		);
	}
	return module.default as Fetcher;
}

/**
 * Hands every request to the built server, before Vite's own files: the
 * app serves `build/client` itself, with its middlewares and cache headers. Its
 * WebSocket routes connect too, relayed as under `react-router dev`.
 */
export function servePreview(server: PreviewServer): void {
	const file = serverBuildPath(server.config);
	const label = relative(server.config.root, file);
	// Loaded on the first request, as `bun build/server/index.js` would be
	// at startup; a failed load is tried again on the next, after a build.
	let app: Promise<Fetcher> | undefined;
	const current = (): Promise<Fetcher> => {
		app ??= load(file, label);
		return app;
	};
	bridgeSockets(server.httpServer, {
		proxy: server.config.preview.proxy,
		// The built server's default export is the alxia app, `websocket` and all.
		load: () =>
			current().catch((error: unknown) => {
				app = undefined;
				throw error;
			}) as Promise<DevApp>,
		logger: server.config.logger,
	});
	server.middlewares.use((req, res, next) => {
		current().then(
			async (loaded) => {
				try {
					await send(res, await loaded.fetch(toRequest(req, res)));
				} catch (error) {
					// Mid-body, the response has started: end it rather than answer twice.
					if (res.headersSent) res.destroy(error as Error);
					else next(error);
				}
			},
			(error: unknown) => {
				app = undefined;
				const message = error instanceof Error ? error.message : String(error);
				server.config.logger.error(message);
				res.statusCode = 500;
				res.setHeader('content-type', 'text/plain; charset=utf-8');
				res.end(message);
			},
		);
	});
}
