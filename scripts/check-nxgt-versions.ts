#!/usr/bin/env bun
/**
 * Lists every `@nxgt/*` devDependency whose locked version is behind npm's
 * `latest`, and says whether the package's peer range admits that release.
 *
 * The adapters here — `@alxia/i18n`, `@alxia/janus`, `@alxia/redis`,
 * `@alxia/telemetry` — peer the nxgt package they wrap and install it as a
 * devDependency at the same range, and the specs run only the version
 * `bun.lock` holds. A new release upstream is therefore tested by nobody
 * here until someone bumps the lock, and a new `0.x` minor is not even
 * admitted by a `^0.x.y` peer until someone widens it. This check is what
 * makes that someone the `nxgt-versions` workflow, weekly, instead of memory.
 *
 * Copied from nxgt-data, itself from nxgt-janus. What differs: the manifests
 * come from `readManifests()` (`packages/*` alone, as newest-peers.ts reads
 * them) and `latest` from `latestOnRegistry()`; each line also names the
 * peer range and whether it admits `latest`, since a bump outside it is a
 * widening, with its changeset.
 *
 * Dependabot would do it, but not here: its Bun updater reads `bun.lock` up to
 * `lockfileVersion` 1 and this one, written by Bun 1.4.2, is 2.
 *
 * Exits 0 when everything is current, 1 when something is behind, 2 when it
 * could not tell — a registry that does not answer is a failure, never
 * "current".
 *
 *   bun run nxgt:outdated
 */
import { join, relative } from 'node:path';
import { ROOT } from './artifacts/packages';
import { latestOnRegistry } from './artifacts/registry';
import { type Manifest, readManifests } from './newest-peers';

const SCOPE = '@nxgt/';

/** An `@nxgt/*` package from outside this repository, as the specs run it. */
export interface Tracked {
	readonly name: string;
	/** The directories, from the root, whose devDependencies name it. */
	readonly dirs: readonly string[];
	/** Every peer range the packages declare for it, sorted. */
	readonly peers: readonly string[];
	/** Every version `bun.lock` resolves it to, oldest first. */
	readonly locked: readonly string[];
}

export interface Behind {
	readonly name: string;
	readonly dirs: readonly string[];
	readonly peers: readonly string[];
	/** The oldest locked version, or `null` when `bun.lock` holds none. */
	readonly locked: string | null;
	readonly latest: string;
	/** Whether every peer range admits `latest`; `true` when none is declared. */
	readonly admitted: boolean;
}

/**
 * The `@nxgt/*` devDependencies of the packages, keyed by directory, with the
 * peer ranges they declare and the versions `bun.lock`'s `packages` resolves
 * them to. Pure. `@alxia/*` siblings are outside the scope, and a
 * `workspace:` spec is skipped all the same.
 */
export function tracked(
	manifests: ReadonlyMap<string, Manifest>,
	lockPackages: Readonly<Record<string, unknown>>,
): Tracked[] {
	const found = new Map<string, { dirs: string[]; peers: Set<string> }>();
	for (const [dir, manifest] of manifests) {
		for (const [name, spec] of Object.entries(manifest.devDependencies ?? {})) {
			if (!name.startsWith(SCOPE) || spec.startsWith('workspace:')) continue;
			const one = found.get(name) ?? { dirs: [], peers: new Set() };
			one.dirs.push(dir);
			const peer = manifest.peerDependencies?.[name];
			if (peer !== undefined) one.peers.add(peer);
			found.set(name, one);
		}
	}
	const locked = new Map<string, Set<string>>();
	for (const entry of Object.values(lockPackages)) {
		const ident = Array.isArray(entry) ? entry[0] : undefined;
		if (typeof ident !== 'string') continue;
		const at = ident.lastIndexOf('@');
		if (at <= 0) continue;
		const name = ident.slice(0, at);
		const version = ident.slice(at + 1);
		// A `workspace:`, a tarball or a git URL is not a release.
		if (!found.has(name) || !/^\d+\.\d+\.\d+/.test(version)) continue;
		locked.set(name, (locked.get(name) ?? new Set()).add(version));
	}
	return [...found]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, { dirs, peers }]) => ({
			name,
			dirs: dirs.sort(),
			peers: [...peers].sort(),
			locked: [...(locked.get(name) ?? [])].sort(Bun.semver.order),
		}));
}

/**
 * The tracked packages whose oldest locked version is below `latest`, or that
 * `bun.lock` does not hold at all. Pure. A package missing from `latest`
 * throws: not knowing is not "current".
 */
export function behind(
	packages: readonly Tracked[],
	latest: ReadonlyMap<string, string>,
): Behind[] {
	return packages.flatMap(({ name, dirs, peers, locked }) => {
		const newest = latest.get(name);
		if (newest === undefined) {
			throw new Error(`check-nxgt-versions: no latest version for ${name}`);
		}
		const oldest = locked[0] ?? null;
		if (oldest !== null && Bun.semver.order(oldest, newest) >= 0) return [];
		const admitted = peers.every((range) =>
			Bun.semver.satisfies(newest, range),
		);
		return [{ name, dirs, peers, locked: oldest, latest: newest, admitted }];
	});
}

/** One line per package behind, as the terminal and the issue both read it. */
export function report(found: readonly Behind[]): string[] {
	return found.map(({ name, dirs, peers, locked, latest, admitted }) => {
		const range =
			peers.length === 0
				? ''
				: `, peer ${peers.join(' and ')} ${admitted ? 'admits it' : 'must widen'}`;
		return `${name}: ${locked ?? 'not in bun.lock'} → ${latest} (${dirs.join(', ')}${range})`;
	});
}

/** The manifests by directory from the root, and `bun.lock`'s packages. */
export async function read(): Promise<{
	manifests: Map<string, Manifest>;
	lockPackages: Record<string, unknown>;
}> {
	const { packages } = await readManifests();
	const manifests = new Map<string, Manifest>();
	for (const [path, manifest] of packages) {
		manifests.set(relative(ROOT, join(path, '..')), manifest);
	}
	const lock = Bun.JSONC.parse(
		await Bun.file(join(ROOT, 'bun.lock')).text(),
	) as { packages?: Record<string, unknown> };
	return { manifests, lockPackages: lock.packages ?? {} };
}

/**
 * The exit code and the lines to print, from the repository and a source of
 * `latest`. Anything thrown is exit 2: it could not tell.
 */
export async function check(
	input: () => ReturnType<typeof read>,
	latestOf: (name: string) => Promise<string>,
): Promise<{ code: 0 | 1 | 2; lines: string[] }> {
	try {
		const { manifests, lockPackages } = await input();
		const packages = tracked(manifests, lockPackages);
		const latest = new Map(
			await Promise.all(
				packages.map(async ({ name }) => [name, await latestOf(name)] as const),
			),
		);
		const lines = report(behind(packages, latest));
		if (lines.length === 0) {
			return {
				code: 0,
				lines: [`${packages.length} @nxgt/* devDependencies, all current`],
			};
		}
		return { code: 1, lines: lines.map((line) => `- ${line}`) };
	} catch (error) {
		return {
			code: 2,
			lines: [error instanceof Error ? error.message : String(error)],
		};
	}
}

if (import.meta.main) {
	const { code, lines } = await check(read, latestOnRegistry);
	for (const line of lines) (code === 2 ? console.error : console.log)(line);
	process.exit(code);
}
