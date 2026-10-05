/** A server a template check starts, and what it answers. */

/** A port nothing listens on, for a server this script starts. */
export function freePort(): number {
	const probe = Bun.serve({ port: 0, fetch: () => new Response() });
	const { port } = probe;
	probe.stop(true);
	if (port === undefined) throw new Error('no free port');
	return port;
}

/** What `request` answers on `port` within 20 seconds, or 0. */
export async function answered(
	port: number,
	request: (base: string) => Promise<Response>,
): Promise<number> {
	const deadline = Date.now() + 20_000;
	while (Date.now() < deadline) {
		const status = await request(`http://localhost:${port}`).then(
			(response) => response.status,
			() => undefined,
		);
		if (status !== undefined) return status;
		await Bun.sleep(250);
	}
	return 0;
}

/** Starts `bun run start` in `dir`, with `own` beside `env`, and resolves to what `request` answers. */
export async function served(
	dir: string,
	env: Record<string, string>,
	request: (base: string) => Promise<Response>,
	own: Readonly<Record<string, string>> = {},
): Promise<number> {
	const port = freePort();
	const server = Bun.spawn(['bun', 'run', 'start'], {
		cwd: dir,
		env: { ...env, ...own, PORT: String(port), NODE_ENV: 'production' },
		stdout: 'inherit',
		stderr: 'inherit',
	});
	try {
		return await answered(port, request);
	} finally {
		server.kill();
		await server.exited;
	}
}

/**
 * `GET /`, then one of the client build's scripts it names: a client
 * navigation loads. The page's answer when the script is served, else the
 * script's; no script named at all is a 404, said so in the log.
 */
export async function pageAndAsset(base: string): Promise<Response> {
	const page = await fetch(`${base}/`);
	const html = await page.clone().text();
	const asset = html.match(/\/assets\/[\w.-]+\.js/)?.[0];
	if (asset === undefined) {
		console.error(`GET / answered ${page.status} naming no /assets/*.js`);
		return new Response(null, { status: 404 });
	}
	const served = await fetch(`${base}${asset}`);
	if (!served.ok) console.error(`GET ${asset} answered ${served.status}`);
	return served.ok ? page : served;
}

/**
 * Each request in turn, each expected to answer its status: a 200 when
 * every one did, else the first that did not, said so in the log.
 */
export function inTurn(
	steps: readonly (readonly [
		request: (base: string) => Promise<Response>,
		expected: number,
	])[],
): (base: string) => Promise<Response> {
	return async (base) => {
		for (const [request, expected] of steps) {
			const response = await request(base);
			if (response.status !== expected) {
				console.error(
					`${response.url} answered ${response.status}, expected ${expected}`,
				);
				// Never a 200 the check would take for every step passing.
				return response.status === 200
					? new Response(null, { status: 500 })
					: response;
			}
		}
		return new Response(null, { status: 200 });
	};
}
