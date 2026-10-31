#!/usr/bin/env bun
/**
 * Rewrites the workspace to build against the oldest version of each
 * `@nxgt/*` peer the packages accept: the lowest stable release its range
 * admits, in either form the ranges take (`^0.7.0 || ^0.8.0` and
 * `>=0.17.1 <0.30.0`), asked of npm.
 *
 * The lockfile runs the top of each of those ranges and newest-peers.ts the
 * other peers' newest alternative; nothing ran the bottom of an `@nxgt/*`
 * range, so a floor could rot unseen. CI's "Floor peers" job runs this,
 * installs, then builds, typechecks, tests and verifies the artifacts. The
 * floor is pinned exactly, in the devDependencies of every package that
 * installs the peer (`@alxia/janus` installs `@nxgt/i18n` beside its own
 * peer): one copy then sits in the workspace.
 *
 * The same job also runs the other major of `graphql-yoga`: the lockfile
 * installs the newest alternative of its range (6), so `yogaFirstMajor` pins
 * the first alternative's floor (5.16.0) and the 3.x `@graphql-yoga/plugin-*`
 * that peer on Yoga 5, and the specs run on Yoga 5.
 *
 * It edits each package's `devDependencies` and the examples' dependencies
 * in place: run it on a throwaway checkout, never commit what it writes.
 *
 *   bun scripts/floor-peers.ts
 */
import {
	followPins,
	type Manifest,
	readExamples,
	readManifests,
	write,
} from './newest-peers';

const SCOPE = '@nxgt/';

/** The lowest stable version of `versions` the range admits; throws when none. */
export function floorOf(range: string, versions: readonly string[]): string {
	const admitted = versions
		.filter((v) => !v.includes('-') && Bun.semver.satisfies(v, range))
		.sort(Bun.semver.order);
	const [floor] = admitted;
	if (floor === undefined) {
		throw new Error(`No published version satisfies ${range}.`);
	}
	return floor;
}

/** Every version npm lists for `name`, prereleases included. */
export async function publishedVersions(name: string): Promise<string[]> {
	const response = await fetch(`https://registry.npmjs.org/${name}`, {
		headers: { accept: 'application/vnd.npm.install-v1+json' },
	});
	if (!response.ok) {
		throw new Error(`npm answered ${response.status} for ${name}.`);
	}
	const body = (await response.json()) as { versions: Record<string, unknown> };
	return Object.keys(body.versions);
}

/** The ranges each `@nxgt/*` peer is accepted with, by name. */
function peerRanges(packages: ReadonlyMap<string, Manifest>) {
	const ranges = new Map<string, Set<string>>();
	for (const manifest of packages.values()) {
		for (const [name, range] of Object.entries(
			manifest.peerDependencies ?? {},
		)) {
			if (!name.startsWith(SCOPE) || range.startsWith('workspace:')) continue;
			ranges.set(name, (ranges.get(name) ?? new Set()).add(range));
		}
	}
	return ranges;
}

/**
 * The packages with every `@nxgt/*` peer pinned to its floor, exact, in the
 * `devDependencies` of each package that installs it. Pure: `versionsOf`
 * answers the published versions, and the caller writes the result.
 */
export function rewrite(
	packages: ReadonlyMap<string, Manifest>,
	versionsOf: (name: string) => readonly string[],
): { packages: Map<string, Manifest>; floors: Map<string, string> } {
	const next = new Map<string, Manifest>();
	for (const [path, manifest] of packages) {
		next.set(path, structuredClone(manifest));
	}
	const floors = new Map<string, string>();
	for (const [name, ranges] of peerRanges(packages)) {
		const found = new Set(
			[...ranges].map((range) => floorOf(range, versionsOf(name))),
		);
		if (found.size > 1) {
			throw new Error(
				`The packages disagree on the floor of ${name}: ${[...found].join(' and ')}. Align their peer ranges.`,
			);
		}
		const [floor] = found as Set<string>;
		let installers = 0;
		for (const manifest of next.values()) {
			if (manifest.dependencies?.[name] !== undefined) {
				throw new Error(
					`${manifest.name} lists ${name} in dependencies, which this job does not pin: move it to devDependencies.`,
				);
			}
			if (manifest.devDependencies?.[name] === undefined) continue;
			manifest.devDependencies[name] = floor as string;
			installers++;
		}
		if (installers === 0) {
			throw new Error(
				`No package installs ${name}: add it to a package's devDependencies.`,
			);
		}
		floors.set(name, floor as string);
	}
	if (floors.size === 0) {
		throw new Error(`No ${SCOPE}* peer range: nothing to pin.`);
	}
	return { packages: next, floors };
}

const YOGA = 'graphql-yoga';
const YOGA_PLUGINS = '@graphql-yoga/plugin-';

/**
 * Pins `graphql-yoga` to the floor of the first alternative of its peer range
 * and each `@graphql-yoga/plugin-*` devDependency to its newest 3.x, the line
 * that peers on Yoga 5, in every package that installs them. Pure: edits the
 * clones `rewrite` returned.
 */
export function yogaFirstMajor(
	packages: ReadonlyMap<string, Manifest>,
	versionsOf: (name: string) => readonly string[],
): Map<string, string> {
	const pins = new Map<string, string>();
	for (const manifest of packages.values()) {
		const dev = manifest.devDependencies;
		const peer = manifest.peerDependencies?.[YOGA];
		if (dev === undefined || peer === undefined) continue;
		const first = peer.split('||')[0]?.trim() as string;
		if (dev[YOGA] === undefined) continue;
		dev[YOGA] = floorOf(first, versionsOf(YOGA));
		pins.set(YOGA, dev[YOGA]);
		for (const name of Object.keys(dev)) {
			if (!name.startsWith(YOGA_PLUGINS)) continue;
			const [newest3] = versionsOf(name)
				.filter((v) => !v.includes('-') && Bun.semver.satisfies(v, '^3.0.0'))
				.sort(Bun.semver.order)
				.reverse();
			if (newest3 === undefined) {
				throw new Error(`No 3.x of ${name} is published.`);
			}
			dev[name] = newest3;
			pins.set(name, newest3);
		}
	}
	return pins;
}

/**
 * Refuses a root `package.json` that names a pinned peer: its override or
 * devDependency would win over the floor and the job would test the top.
 */
export function refuseRootPins(root: Manifest, names: Iterable<string>): void {
	for (const name of names) {
		for (const field of [
			'overrides',
			'dependencies',
			'devDependencies',
		] as const) {
			if (root[field]?.[name] !== undefined) {
				throw new Error(
					`The root package.json names ${name} in ${field}, which would win over its floor: remove it.`,
				);
			}
		}
	}
}

if (import.meta.main) {
	try {
		const { root, packages } = await readManifests();
		const names = [...peerRanges(packages).keys()];
		refuseRootPins(root, names);
		const published = new Map<string, string[]>();
		for (const name of names)
			published.set(name, await publishedVersions(name));
		const result = rewrite(packages, (name) => published.get(name) ?? []);
		const yogaNames = new Set([YOGA]);
		for (const manifest of result.packages.values()) {
			for (const name of Object.keys(manifest.devDependencies ?? {})) {
				if (name.startsWith(YOGA_PLUGINS)) yogaNames.add(name);
			}
		}
		for (const name of yogaNames) {
			if (!published.has(name)) published.set(name, await publishedVersions(name));
		}
		const yoga = yogaFirstMajor(
			result.packages,
			(name) => published.get(name) ?? [],
		);
		const followed = followPins(await readExamples(), (name) =>
			result.floors.get(name) ?? yoga.get(name),
		);
		for (const [path, manifest] of result.packages) await write(path, manifest);
		for (const [path, manifest] of followed.examples)
			await write(path, manifest);
		for (const [name, version] of result.floors) {
			console.log(`pinned ${name} ${version}`);
		}
		for (const [name, version] of yoga) {
			console.log(`pinned ${name} ${version}`);
		}
	} catch (error) {
		console.error((error as Error).message);
		process.exit(1);
	}
}
