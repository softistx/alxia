/** A fake npm registry, for the specs that resolve versions against one. */

/** A registry that knows `versions` of each package, `latest` the last one. */
export function fakeRegistry(
	packages: Record<string, readonly string[]>,
	options: { failing?: readonly string[] } = {},
): { url: string; requested: string[]; stop: () => void } {
	const requested: string[] = [];
	const server = Bun.serve({
		port: 0,
		fetch: (request) => {
			const name = decodeURIComponent(new URL(request.url).pathname.slice(1));
			requested.push(name);
			const versions = packages[name];
			if (!versions || options.failing?.includes(name)) {
				return new Response('not found', { status: 404 });
			}
			return Response.json({
				name,
				'dist-tags': { latest: versions.at(-1) },
				versions: Object.fromEntries(versions.map((v) => [v, {}])),
			});
		},
	});
	return {
		url: `http://localhost:${server.port}`,
		requested,
		stop: () => server.stop(true),
	};
}
