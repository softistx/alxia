/**
 * What the service worker and the page agree on: the worker's address, the
 * offline page, the message that applies an update, and the names of the
 * caches the worker owns. Dependency-free: the worker bundles it, with no
 * DOM and no React.
 */

/** Where the build writes the worker; registered with scope `/`. */
export const SERVICE_WORKER_URL = '/service-worker.js';

/** The page served when a navigation fails for want of a network. */
export const OFFLINE_URL = '/offline.html';

/** The message a page posts to a waiting worker to make it take over. */
export const SKIP_WAITING = 'SKIP_WAITING';

export interface WorkerContractOptions {
	/**
	 * Every Cache Storage cache the worker owns starts with `<cachePrefix>-`.
	 * Required: two apps on one origin must not share it.
	 */
	cachePrefix: string;
	/**
	 * Bumped when a cache's content changes shape: the next worker deletes
	 * every cache of the prefix that has another version when it activates.
	 * `'v1'` by default.
	 */
	cacheVersion?: string;
	/** `SERVICE_WORKER_URL` by default. */
	serviceWorkerUrl?: string;
	/** `OFFLINE_URL` by default. */
	offlineUrl?: string;
}

export type CacheNames = {
	/**
	 * The offline page and the hashed scripts and stylesheets of every route.
	 * `<prefix>-precache-<version>` is the name Workbox builds from
	 * `setCacheNameDetails({ prefix, precache: 'precache', suffix: version })`.
	 */
	readonly precache: string;
	/** `/assets/*` bundles: hashed names, so cache-first. */
	readonly assets: string;
	/** Icons, sprites, the logo: stale-while-revalidate. */
	readonly static: string;
};

export interface WorkerContract {
	readonly cachePrefix: string;
	readonly cacheVersion: string;
	readonly serviceWorkerUrl: string;
	readonly offlineUrl: string;
	readonly cacheNames: CacheNames;
	/** The caches a worker deletes on activate: the prefix's, of another version. */
	obsoleteCaches(names: readonly string[]): string[];
	/**
	 * The caches `clearAppCaches()` deletes: all of the prefix's but the
	 * current precache, which holds the offline page and the app's code, never
	 * a user's data.
	 */
	clearableCaches(names: readonly string[]): string[];
}

/** Builds the contract of one app from its cache prefix. */
export function defineWorkerContract(
	options: WorkerContractOptions,
): WorkerContract {
	const { cachePrefix } = options;
	if (typeof cachePrefix !== 'string' || cachePrefix === '') {
		throw new TypeError(
			`defineWorkerContract(): cachePrefix must be a non-empty name, such as 'my-app'; got '${String(cachePrefix)}'.`,
		);
	}
	if (cachePrefix.endsWith('-')) {
		throw new TypeError(
			`defineWorkerContract(): cachePrefix must not end with '-', which the contract adds; got '${cachePrefix}'. Use '${cachePrefix.replace(/-+$/, '')}'.`,
		);
	}
	const cacheVersion = options.cacheVersion ?? 'v1';
	const cacheNames: CacheNames = Object.freeze({
		precache: `${cachePrefix}-precache-${cacheVersion}`,
		assets: `${cachePrefix}-assets-${cacheVersion}`,
		static: `${cachePrefix}-static-${cacheVersion}`,
	});
	const current = new Set<string>(Object.values(cacheNames));
	const owned = (name: string) => name.startsWith(`${cachePrefix}-`);
	const contract: WorkerContract = {
		cachePrefix,
		cacheVersion,
		serviceWorkerUrl: options.serviceWorkerUrl ?? SERVICE_WORKER_URL,
		offlineUrl: options.offlineUrl ?? OFFLINE_URL,
		cacheNames,
		obsoleteCaches: (names) =>
			names.filter((name) => owned(name) && !current.has(name)),
		clearableCaches: (names) =>
			names.filter((name) => owned(name) && name !== cacheNames.precache),
	};
	return Object.freeze(contract);
}
