/**
 * A registry on localhost that answers for the packed `@alxia/*` tarballs
 * and passes every other request to npm's: `bun create @alxia` then runs
 * the `@alxia/create` this checkout packed, and the project it writes
 * installs this checkout's packages, by the ranges it declares, as it would
 * from npm once they are published.
 */

/** What the registry serves: each package's manifest and tarball. */
export interface Served {
	readonly manifest: Record<string, unknown>;
	readonly file: string;
}

export interface LocalRegistry {
	readonly url: string;
	stop(): void;
}

/** The `dist` fields npm and Bun check a tarball against. */
async function distOf(file: string, url: string) {
	const bytes = await Bun.file(file).bytes();
	const sha512 = new Bun.CryptoHasher('sha512').update(bytes).digest('base64');
	const shasum = new Bun.CryptoHasher('sha1').update(bytes).digest('hex');
	return { tarball: url, integrity: `sha512-${sha512}`, shasum };
}

/**
 * Starts the registry on a free port. A package of `served` is answered
 * with a packument holding its one version, `latest`; any other request is
 * fetched from `upstream`, with the same `accept` header.
 */
export async function startRegistry(
	served: readonly Served[],
	upstream = 'https://registry.npmjs.org',
): Promise<LocalRegistry> {
	const files = new Map<string, string>();
	const packuments = new Map<string, unknown>();
	const server = Bun.serve({
		port: 0,
		fetch: async (request) => {
			const { pathname, search } = new URL(request.url);
			const tarball = files.get(pathname);
			if (tarball) return new Response(Bun.file(tarball));
			const packument = packuments.get(decodeURIComponent(pathname.slice(1)));
			if (packument) return Response.json(packument);
			const answer = await fetch(`${upstream}${pathname}${search}`, {
				headers: { accept: request.headers.get('accept') ?? '*/*' },
			});
			// fetch already decoded the body: send it without its encoding.
			return new Response(await answer.arrayBuffer(), {
				status: answer.status,
				headers: {
					'content-type':
						answer.headers.get('content-type') ?? 'application/octet-stream',
				},
			});
		},
	});
	const url = `http://localhost:${server.port}`;
	for (const { manifest, file } of served) {
		const name = manifest['name'] as string;
		const version = manifest['version'] as string;
		const path = `/-/${name.replace('/', '-')}-${version}.tgz`;
		files.set(path, file);
		packuments.set(name, {
			name,
			'dist-tags': { latest: version },
			versions: {
				[version]: { ...manifest, dist: await distOf(file, `${url}${path}`) },
			},
		});
	}
	return { url, stop: () => server.stop(true) };
}
