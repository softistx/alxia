/**
 * Moves a generated project's dependencies to their newest versions on the
 * registry, within what alxia accepts: a template ships the versions it was
 * written with, and React Router's lags behind its own releases.
 */
import { PEER_RANGES } from './versions';

/** The dependency fields of a manifest, as a template writes them. */
export interface Manifest {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	[key: string]: unknown;
}

/** How to reach the registry: its URL, and the `fetch` to call it with. */
export interface Registry {
	readonly url: string;
	readonly fetch?: (request: Request) => Promise<Response>;
	/** How long one package's metadata may take, in milliseconds. */
	readonly timeout?: number;
}

/** What a bump changed, and what it could not. */
export interface Bumped {
	/** One line per dependency moved: `vite ^8.0.3 -> ^8.3.2`. */
	readonly moved: string[];
	/** A newer major that was left out, because a range refuses it. */
	readonly held: string[];
	/** A package whose metadata did not arrive: its version is unchanged. */
	readonly failed: string[];
}

/** The registry to resolve against: the one Bun or npm was given, or npm's. */
export function registryUrl(env: Record<string, string | undefined>): string {
	const url =
		env['BUN_CONFIG_REGISTRY'] ||
		env['npm_config_registry'] ||
		'https://registry.npmjs.org';
	return url.replace(/\/+$/, '');
}

/**
 * The range alxia's peers hold `name` to — React Router's packages follow
 * `react-router`'s — or undefined when none does, and npm's `latest` is
 * taken.
 */
export function allowedRange(name: string): string | undefined {
	if (name === 'react-router' || name.startsWith('@react-router/')) {
		return PEER_RANGES['react-router'];
	}
	return name in PEER_RANGES
		? PEER_RANGES[name as keyof typeof PEER_RANGES]
		: undefined;
}

interface Packument {
	readonly 'dist-tags'?: Record<string, string>;
	readonly versions?: Record<string, unknown>;
}

/** The newest release (not a prerelease) of `versions` within `range`. */
export function newestWithin(
	versions: readonly string[],
	range: string,
): string | undefined {
	return versions
		.filter((v) => !v.includes('-') && Bun.semver.satisfies(v, range))
		.sort(Bun.semver.order)
		.at(-1);
}

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

/** Within `range`, the newest; with none, npm's `latest`. */
function choose(
	versions: readonly string[],
	range: string | undefined,
	latest: string | undefined,
): string | undefined {
	if (range !== undefined) return newestWithin(versions, range);
	return latest && versions.includes(latest)
		? latest
		: newestWithin(versions, '*');
}

/**
 * Rewrites every dependency of `manifest` but those in `keep` to `^` its
 * newest version: within the range alxia's peers hold it to, or npm's
 * `latest` when none does. React Router's own packages take the
 * version `react-router` resolved to, when they have it: `@react-router/node`
 * pins `react-router` exactly. A package whose metadata fails to arrive keeps
 * its version, and is named in `failed`.
 */
export async function bumpDependencies(
	manifest: Manifest,
	registry: Registry,
	keep: ReadonlySet<string> = new Set(),
): Promise<Bumped> {
	const fields = ['dependencies', 'devDependencies'] as const;
	const names = fields.flatMap((field) =>
		Object.keys(manifest[field] ?? {}).filter((name) => !keep.has(name)),
	);
	const fetched = new Map(
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
	const moved: string[] = [];
	const held: string[] = [];
	const failed: string[] = [];
	const chosen = new Map<string, string>();
	// react-router first: its siblings follow the version it settles on.
	const ordered = [...names].sort(
		(a, b) => Number(b === 'react-router') - Number(a === 'react-router'),
	);
	for (const name of ordered) {
		const field = fields.find((f) => manifest[f]?.[name] !== undefined);
		const deps = field && manifest[field];
		const current = deps?.[name];
		if (!deps || current === undefined) continue;
		const meta = fetched.get(name);
		if (!meta?.versions) {
			failed.push(name);
			continue;
		}
		const versions = Object.keys(meta.versions);
		const range = allowedRange(name);
		const latest = meta['dist-tags']?.['latest'];
		const follow = chosen.get('react-router');
		const version =
			name.startsWith('@react-router/') && follow && versions.includes(follow)
				? follow
				: choose(versions, range, latest);
		if (version === undefined) {
			failed.push(name);
			continue;
		}
		chosen.set(name, version);
		if (
			range !== undefined &&
			latest &&
			Bun.semver.order(latest, version) > 0 &&
			!Bun.semver.satisfies(latest, range)
		) {
			held.push(
				`${name}: kept to ${range}, where the newest is ${version}; npm's latest, ${latest}, is outside it`,
			);
		}
		const next = `^${version}`;
		if (next !== current) moved.push(`${name} ${current} -> ${next}`);
		deps[name] = next;
	}
	return { moved, held, failed };
}
