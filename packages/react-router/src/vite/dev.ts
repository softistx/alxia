/**
 * Under `react-router dev`: a request Vite left, answered by the server,
 * loaded through the ssr environment's module runner.
 */
import type { ViteDevServer } from 'vite';
import { DEFAULT, SERVER, serverFile } from './config';
import { NAME } from './entry';
import { send, toRequest } from './node';

export async function serveFromEntry(
	server: ViteDevServer,
	entry: string | undefined,
	req: Parameters<typeof toRequest>[0],
	res: Parameters<typeof toRequest>[1],
): Promise<void> {
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
	)) as { readonly default: { fetch(request: Request): Promise<Response> } };
	await send(res, await module.default.fetch(toRequest(req, res)));
}
