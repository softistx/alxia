#!/usr/bin/env bun
/**
 * Rewrites the workspace to build against what npm publishes as `latest` for
 * each widened peer — a peer whose range has alternatives, such as
 * `typescript: ^6.0.3 || ^7.0.0` — rather than the newest one the range
 * names, which is scripts/newest-peers.ts's job.
 *
 * Today both answer TypeScript 7 and graphql 17. They part the day a new
 * major ships: "Newest peers" keeps proving the ranges as written, while CI's
 * "Newest majors" job, which runs this, tries the new major before any range
 * accepts it, and says so — the signal to widen, or to know why not.
 *
 * Each version keeps the operator its manifest wrote (`~` for the root's
 * typescript, which breaks in minors; `^` for graphql) with npm's latest
 * after it: the root's `devDependencies` and `overrides`, and each package's
 * `devDependencies`, edited in place. The job deletes `bun.lock` first, so
 * nothing else stays pinned either. Run it on a throwaway checkout, never
 * commit what it writes.
 *
 *   bun scripts/newest-majors.ts
 */
import { latestOnRegistry } from './artifacts/registry';
import {
	type Manifest,
	newest,
	type Rewrite,
	readManifests,
	write,
} from './newest-peers';

/** The major of a version or a range: `7` for `~7.0.2`, `^7.0.0` or `7`. */
export function majorOf(version: string): number {
	return Number(/^\D*(\d+)/.exec(version)?.[1]);
}

/**
 * Every peer some package accepts in more than one major, with the newest
 * major any range names, and the packages that widen it.
 */
export function widenedPeers(
	packages: ReadonlyMap<string, Manifest>,
): Map<string, { major: number; by: string[] }> {
	const peers = new Map<string, { major: number; by: string[] }>();
	for (const manifest of packages.values()) {
		for (const [name, range] of Object.entries(
			manifest.peerDependencies ?? {},
		)) {
			const version = newest(range);
			if (version === undefined) continue;
			const major = majorOf(version);
			if (!Number.isFinite(major)) {
				throw new Error(
					`${manifest.name} accepts ${name} ${range}, whose last alternative names no major: write it as ^<major>.`,
				);
			}
			const seen = peers.get(name) ?? { major, by: [] };
			seen.major = Math.max(seen.major, major);
			seen.by.push(String(manifest.name));
			peers.set(name, seen);
		}
	}
	return peers;
}

/** `version` behind the operator `range` was written with. */
function keepOperator(range: string, version: string): string {
	return `${/^[~^]/.exec(range)?.[0] ?? ''}${version}`;
}

export interface Majors extends Rewrite {
	/** What to warn about: a latest beyond every range, or below the newest. */
	readonly warnings: readonly string[];
}

/**
 * The manifests with every widened peer moved to `latest`, its npm version.
 * Pure: the caller fetches `latest` and writes the result, or nothing when
 * this throws.
 *
 * Unlike newest-peers.ts, every package that installs the peer moves, not
 * only those that widen it: one copy of each major in the workspace. And
 * packages naming different newest majors is not an error here: npm's
 * latest is one version whatever the ranges say.
 */
export function rewrite(
	root: Manifest,
	packages: ReadonlyMap<string, Manifest>,
	latest: ReadonlyMap<string, string>,
): Majors {
	const peers = widenedPeers(packages);
	if (peers.size === 0) {
		throw new Error('No peer range has an alternative: nothing newer to test.');
	}
	const nextRoot: Manifest = structuredClone(root);
	const next = new Map<string, Manifest>();
	const pinned: string[] = [];
	const warnings: string[] = [];

	const pin = (
		where: string,
		field: Record<string, string> | undefined,
		name: string,
	): void => {
		const range = field?.[name];
		const version = latest.get(name);
		if (field === undefined || range === undefined || version === undefined) {
			return;
		}
		field[name] = keepOperator(range, version);
		pinned.push(`${where.padEnd(24)} ${name}@${field[name]}`);
	};

	for (const [name, { major, by }] of peers) {
		const version = latest.get(name);
		if (version === undefined) {
			throw new Error(`npm gave no latest version of ${name}.`);
		}
		for (const manifest of packages.values()) {
			if (
				by.includes(String(manifest.name)) &&
				manifest.devDependencies?.[name] === undefined &&
				root.devDependencies?.[name] === undefined
			) {
				throw new Error(
					`${manifest.name} accepts several majors of ${name}, but neither it nor the root installs ${name}: add it to ${manifest.name}'s devDependencies.`,
				);
			}
		}
		if (majorOf(version) > major) {
			warnings.push(
				`${name} ${version} is newer than any peer range accepts (^${major}): it builds and typechecks here; widen the ranges, and Newest peers then runs the specs on it.`,
			);
		} else if (majorOf(version) < major) {
			warnings.push(
				`npm's latest ${name} is ${version}, below the newest major a range accepts (^${major}): this job tests ${majorOf(version)}, Newest peers tests ${major}.`,
			);
		}
	}

	for (const [path, manifest] of packages) {
		const copy: Manifest = structuredClone(manifest);
		for (const name of peers.keys()) {
			pin(String(copy.name), copy.devDependencies, name);
		}
		next.set(path, copy);
	}
	for (const name of peers.keys()) {
		pin('(root devDependencies)', nextRoot.devDependencies, name);
		pin('(root overrides)', nextRoot.overrides, name);
	}
	return { root: nextRoot, packages: next, pinned, warnings };
}

if (import.meta.main) {
	const { rootPath, root, packages } = await readManifests();
	let result: Majors;
	try {
		const latest = new Map<string, string>();
		for (const name of widenedPeers(packages).keys()) {
			latest.set(name, await latestOnRegistry(name));
		}
		result = rewrite(root, packages, latest);
	} catch (error) {
		console.error((error as Error).message);
		process.exit(1);
	}
	await write(rootPath, result.root);
	for (const [path, manifest] of result.packages) await write(path, manifest);
	for (const line of result.pinned) console.log(`  pinned   ${line}`);
	for (const line of result.warnings) {
		console.log(process.env.GITHUB_ACTIONS ? `::warning::${line}` : line);
	}
}
