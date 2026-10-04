/**
 * Moves a generated project's dependencies to their newest versions on the
 * registry, within what alxia accepts: a template ships the versions it was
 * written with, and React Router's lags behind its own releases. alxia's own
 * packages move within the ranges this `@alxia/create` was published with,
 * and fall back on the same minor when the registry does not have the
 * version those ranges start at yet.
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
	/** A package with no release within its range: its version is unchanged. */
	readonly unmatched: string[];
	/**
	 * An `@alxia/*` package whose version the range starts at is not on the
	 * registry yet, as just after a release: the newest of the same minor
	 * was written instead.
	 */
	readonly behind: string[];
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
 * Whether `range` is one exact version, as `2.5.15`: how a template pins a
 * tool whose patch releases may change its output, as Biome asks to be
 * pinned. Such a dependency stays exact, and within its own minor: a
 * minor of Biome may add a recommended rule the template was not checked
 * against.
 */
export function isExact(range: string): boolean {
	return /^\d+\.\d+\.\d+$/.test(range);
}

/**
 * Tools whose exact pin the template keeps as it is, even from the newest
 * patch of its minor: a project's `bun run verify` runs `generate --check`
 * over the committed `src/generated/`, so a generator patch that writes the
 * files differently would fail a fresh project on files it never touched.
 */
export const KEPT_EXACT: ReadonlySet<string> = new Set([
	'@nxgt/openapi-codegen',
]);

/**
 * `range`'s own minor, from its first version: `~0.3.0` for `^0.3.1`, or
 * undefined for a range that names no version.
 */
export function sameMinor(range: string): string | undefined {
	const match = /(\d+)\.(\d+)\.\d+/.exec(range);
	return match ? `~${match[1]}.${match[2]}.0` : undefined;
}

/**
 * For a `built` range with no release on the registry: the newest of its
 * own minor whose `^` still takes the version the range starts at, or
 * undefined. Below 0.1, `^0.0.2` does not take 0.0.3: no fallback there.
 */
export function newestOfMinor(
	versions: readonly string[],
	range: string,
): string | undefined {
	const minor = sameMinor(range);
	const start = /\d+\.\d+\.\d+/.exec(range)?.[0];
	const version = minor && newestWithin(versions, minor);
	return version && start && Bun.semver.satisfies(start, `^${version}`)
		? version
		: undefined;
}

/**
 * Rewrites every dependency of `manifest` to `^` its newest version: within
 * `built[name]` for a package it names — alxia's, at the ranges this
 * `@alxia/create` was published with — else within the range alxia's peers
 * hold it to, else npm's `latest`. A dependency the template pins exactly
 * (`isExact`) is rewritten exactly, to the newest of its own minor, except
 * a `KEPT_EXACT` one, which keeps the template's version. A
 * package of `built` with no release in
 * its range, as when npm has not yet propagated a version published minutes
 * ago, takes the newest of the range's own minor, named in `behind`: `^` it
 * is still within the range. React Router's own packages take the version
 * `react-router` resolved to, when they have it: `@react-router/node` pins
 * `react-router` exactly. A package whose metadata fails to arrive keeps its
 * version, and is named in `failed`.
 */
export async function bumpDependencies(
	manifest: Manifest,
	registry: Registry,
	built: Readonly<Record<string, string>> = {},
): Promise<Bumped> {
	const fields = ['dependencies', 'devDependencies'] as const;
	const names = fields.flatMap((field) => Object.keys(manifest[field] ?? {}));
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
	const unmatched: string[] = [];
	const behind: string[] = [];
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
		if (KEPT_EXACT.has(name) && isExact(current)) continue;
		const meta = fetched.get(name);
		if (!meta?.versions) {
			failed.push(name);
			continue;
		}
		const versions = Object.keys(meta.versions);
		const pinned = built[name];
		const exact = isExact(current);
		const range =
			pinned ?? allowedRange(name) ?? (exact ? `~${current}` : undefined);
		const latest = meta['dist-tags']?.['latest'];
		const follow = chosen.get('react-router');
		let version =
			name.startsWith('@react-router/') && follow && versions.includes(follow)
				? follow
				: choose(versions, range, latest);
		if (version === undefined && pinned !== undefined) {
			version = newestOfMinor(versions, pinned);
			if (version !== undefined) {
				behind.push(
					`${name}: the registry has no release within ${range} yet; wrote ^${version}, the newest of ${sameMinor(pinned)}`,
				);
			}
		}
		if (version === undefined) {
			unmatched.push(
				`${name}: no release within ${range ?? 'any range'}; kept ${current}`,
			);
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
		const next = exact ? version : `^${version}`;
		if (next !== current) moved.push(`${name} ${current} -> ${next}`);
		deps[name] = next;
	}
	return { moved, held, failed, unmatched, behind };
}
