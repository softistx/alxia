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
	return Number(/\d+/.exec(version)?.[0]);
}

/** Every peer some package accepts in more than one major. */
export function widenedPeers(
	packages: ReadonlyMap<string, Manifest>,
): Map<string, number> {
	const peers = new Map<string, number>();
	for (const manifest of packages.values()) {
		for (const [name, range] of Object.entries(
			manifest.peerDependencies ?? {},
		)) {
			const version = newest(range);
			if (version === undefined) continue;
			peers.set(name, Math.max(peers.get(name) ?? 0, majorOf(version)));
		}
	}
	return peers;
}

/** `version` behind the operator `range` was written with. */
function keepOperator(range: string, version: string): string {
	return `${/^[~^]/.exec(range)?.[0] ?? ''}${version}`;
}

export interface Majors extends Rewrite {
	/** The peers whose latest no range accepts yet: worth a warning. */
	readonly ahead: readonly string[];
}

/**
 * The manifests with every widened peer moved to `latest`, its npm version.
 * Pure: the caller fetches `latest` and writes the result, or nothing when
 * this throws.
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
	const ahead: string[] = [];
	const installed = new Set<string>();

	const pin = (
		where: string,
		field: Record<string, string> | undefined,
		name: string,
	): boolean => {
		const range = field?.[name];
		const version = latest.get(name);
		if (field === undefined || range === undefined || version === undefined) {
			return false;
		}
		field[name] = keepOperator(range, version);
		pinned.push(`${where.padEnd(24)} ${name}@${field[name]}`);
		return true;
	};

	for (const [path, manifest] of packages) {
		const copy: Manifest = structuredClone(manifest);
		for (const name of peers.keys()) {
			if (pin(String(copy.name), copy.devDependencies, name)) {
				installed.add(name);
			}
		}
		next.set(path, copy);
	}
	for (const [name, accepted] of peers) {
		const version = latest.get(name);
		if (version === undefined) {
			throw new Error(`npm gave no latest version of ${name}.`);
		}
		if (pin('(root devDependencies)', nextRoot.devDependencies, name)) {
			installed.add(name);
		}
		pin('(root overrides)', nextRoot.overrides, name);
		if (!installed.has(name)) {
			throw new Error(
				`A package accepts several majors of ${name}, but neither it nor the root installs ${name}: add it to that package's devDependencies.`,
			);
		}
		if (majorOf(version) > accepted) {
			ahead.push(
				`${name} ${version} is newer than any peer range accepts (^${accepted}): widen them once this job is green.`,
			);
		}
	}
	return { root: nextRoot, packages: next, pinned, ahead };
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
	for (const line of result.ahead) {
		console.log(process.env.GITHUB_ACTIONS ? `::warning::${line}` : line);
	}
}
