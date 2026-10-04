/** Reading packages' metadata from the registry, as `bun install` asks for it. */

/** How to reach the registry: its URL, and the `fetch` to call it with. */
export interface Registry {
	readonly url: string;
	readonly fetch?: (request: Request) => Promise<Response>;
	/** How long one package's metadata may take, in milliseconds. */
	readonly timeout?: number;
}

/** The registry to resolve against: the one Bun or npm was given, or npm's. */
export function registryUrl(env: Record<string, string | undefined>): string {
	const url =
		env['BUN_CONFIG_REGISTRY'] ||
		env['npm_config_registry'] ||
		'https://registry.npmjs.org';
	return url.replace(/\/+$/, '');
}

/** What the registry says of a package: its tags and its versions. */
export interface Packument {
	readonly 'dist-tags'?: Record<string, string>;
	readonly versions?: Record<string, unknown>;
}

/** One package's metadata, or a rejection: a status other than 2xx, a timeout. */
async function packument(name: string, registry: Registry): Promise<Packument> {
	const call = registry.fetch ?? ((request: Request) => fetch(request));
	const response = await call(
		new Request(`${registry.url}/${name.replace('/', '%2f')}`, {
			headers: { accept: 'application/vnd.npm.install-v1+json' },
			signal: AbortSignal.timeout(registry.timeout ?? 5000),
		}),
	);
	if (!response.ok) throw new Error(`${response.status}`);
	return (await response.json()) as Packument;
}

/** Each package's metadata, fetched together: `undefined` for one that did not arrive. */
export async function packuments(
	names: readonly string[],
	registry: Registry,
): Promise<Map<string, Packument | undefined>> {
	return new Map(
		await Promise.all(
			names.map(
				async (name) =>
					[
						name,
						await packument(name, registry).catch(() => undefined),
					] as const,
			),
		),
	);
}
