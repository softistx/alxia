/** A connection from a proxy, and the headers it forwards, for the proxy specs. */

/** A server whose every connection comes from `peer`. */
export const from = (peer: string) =>
	({ requestIP: () => ({ address: peer }) }) as unknown as Bun.Server<unknown>;

/** What a proxy forwards for a client. */
export const behindProxy = {
	'x-forwarded-for': '203.0.113.9',
	'x-forwarded-proto': 'https',
	'x-forwarded-host': 'example.com',
};

/** `path` on `served`, with `headers`, over a connection from `server`. */
export const get = (
	served: { fetch: (r: Request, s?: Bun.Server<unknown>) => Promise<Response> },
	path: string,
	headers: Record<string, string>,
	server: Bun.Server<unknown>,
) =>
	served.fetch(
		new Request(`http://app.internal:3000${path}`, { headers }),
		server,
	);
