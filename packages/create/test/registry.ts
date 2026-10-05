/** A fake npm registry, for the specs that resolve versions against one. */

/** The versions the registry specs resolve against. */
export const VERSIONS = {
	typescript: ['5.9.3', '6.0.3', '7.0.2', '7.1.0-dev.1', '8.0.0'],
	vite: ['7.3.0', '8.0.3', '8.3.2', '9.0.0'],
	'react-router': ['8.3.0', '8.4.0', '9.0.0'],
	'@react-router/node': ['8.3.0', '8.4.0', '8.4.1', '9.0.0'],
	'@react-router/dev': ['8.3.0', '8.4.0', '9.0.0'],
	'@types/node': ['22.20.5', '26.6.4'],
	zod: ['3.25.0', '4.2.0', '4.6.5'],
	isbot: ['5.1.36', '5.2.2'],
	'@biomejs/biome': ['2.5.15', '2.5.16', '2.6.0', '3.0.0'],
};

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
