import {
	type Caching,
	type CachingOptions,
	cachingFor,
	type RequestFacts,
} from '../model/caching';
import type { PrecacheEntry } from '../model/precache-list';
import { isStorable } from '../model/storable';
import { SKIP_WAITING, type WorkerContract } from '../model/worker-contract';

/** How many files, and for how long, a runtime cache keeps. */
export interface ExpirationOptions {
	maxEntries?: number;
	maxAgeSeconds?: number;
}

export interface WorkerOptions {
	/** The app's contract: cache names, offline page, the worker's URL. */
	contract: WorkerContract;
	/** What `cachingFor` reads besides the contract: `never`, `immutable`, `manifestPath`, `serviceWorkerUrl`. */
	caching?: Omit<CachingOptions, 'contract'>;
	/** The hashed bundles' cache. `{ maxEntries: 200 }` by default. */
	assets?: ExpirationOptions;
	/** The other static files' cache. `{ maxEntries: 100, maxAgeSeconds: 30 days }` by default. */
	static?: ExpirationOptions;
	/** Start the worker alongside a page load. `true` by default. */
	navigationPreload?: boolean;
	/** The precache list. By default the one the build wrote into the worker. */
	precache?: readonly PrecacheEntry[];
}

export type WorkerRoute =
	| {
			caching: 'navigation';
			strategy: 'network-only';
			fallback: string | undefined;
	  }
	| {
			caching: 'immutable';
			strategy: 'cache-first';
			cacheName: string;
			expiration: ExpirationOptions & { maxEntries: number };
	  }
	| {
			caching: 'static';
			strategy: 'stale-while-revalidate';
			cacheName: string;
			expiration: ExpirationOptions;
	  };

export interface WorkerPlan {
	cacheNameDetails: { prefix: string; precache: 'precache'; suffix: string };
	precache: readonly PrecacheEntry[];
	routes: readonly WorkerRoute[];
	navigationPreload: boolean;
}

const THIRTY_DAYS = 30 * 24 * 60 * 60;

/** What the worker does, decided without Workbox so that it is tested as data. */
export function workerPlan(
	options: WorkerOptions,
	injected: readonly PrecacheEntry[] | undefined,
): WorkerPlan {
	const { contract } = options;
	if (!contract) {
		throw new TypeError(
			'startWorker(): contract is required: pass defineWorkerContract({ cachePrefix }) from @alxia/react-router/pwa.',
		);
	}
	const precache = options.precache ?? injected;
	if (!precache) {
		throw new Error(
			'startWorker(): no precache list. Build this worker with alxia() from @alxia/react-router/vite (app/service-worker.ts) or buildWorker() from @alxia/react-router/pwa/build, which write it in.',
		);
	}
	const offlineUrl = contract.offlineUrl;
	const hasOffline = precache.some(
		(entry) => entry.url.split('?')[0] === offlineUrl,
	);
	return {
		cacheNameDetails: {
			prefix: contract.cachePrefix,
			precache: 'precache',
			suffix: contract.cacheVersion,
		},
		precache,
		routes: [
			{
				caching: 'navigation',
				strategy: 'network-only',
				fallback: hasOffline ? offlineUrl : undefined,
			},
			{
				caching: 'immutable',
				strategy: 'cache-first',
				cacheName: contract.cacheNames.assets,
				expiration: { maxEntries: 200, ...options.assets },
			},
			{
				caching: 'static',
				strategy: 'stale-while-revalidate',
				cacheName: contract.cacheNames.static,
				expiration: {
					maxEntries: 100,
					maxAgeSeconds: THIRTY_DAYS,
					...options.static,
				},
			},
		],
		navigationPreload: options.navigationPreload ?? true,
	};
}

/** Whether a request is answered the way `caching` says. */
export function matcher(
	caching: Caching,
	origin: () => string,
	options: WorkerOptions,
): (o: { request: RequestFacts }) => boolean {
	return ({ request }) =>
		cachingFor(request, origin(), {
			...options.caching,
			contract: options.contract,
		}) === caching;
}

/** Stores only what `isStorable` accepts: a public, same-origin 200. */
export const storableOnly = {
	async cacheWillUpdate({
		response,
	}: {
		response: Response;
	}): Promise<Response | null> {
		return isStorable(response) ? response : null;
	},
};

export function isSkipWaiting(data: unknown): boolean {
	return (data as { type?: unknown } | null | undefined)?.type === SKIP_WAITING;
}

/** Deletes the caches an earlier version of the contract owned. */
export async function deleteObsoleteCaches(
	contract: Pick<WorkerContract, 'obsoleteCaches'>,
	storage: Pick<CacheStorage, 'keys' | 'delete'>,
): Promise<void> {
	const names = await storage.keys();
	await Promise.all(
		contract.obsoleteCaches(names).map((name) => storage.delete(name)),
	);
}
