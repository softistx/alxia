import {
	clientsClaim,
	setCacheNameDetails,
	type WorkboxPlugin,
} from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import * as navigationPreload from 'workbox-navigation-preload';
import { matchPrecache, precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import {
	CacheFirst,
	NetworkOnly,
	StaleWhileRevalidate,
} from 'workbox-strategies';
import { injectedPrecache } from './injected';
import {
	deleteObsoleteCaches,
	isSkipWaiting,
	matcher,
	storableOnly,
	type WorkerOptions,
	workerPlan,
} from './plan';
import { workerScope } from './scope';

/**
 * Starts the service worker on Workbox. Call it once, from the worker's entry.
 *
 * - The precache route is registered first: a precached URL is answered from
 *   the precache before any route below. Exact URLs only (`cleanURLs: false`,
 *   no directory index), so a page load still goes to the network.
 * - A navigation is never stored: with navigation preload the browser starts
 *   the request alongside the worker, and `NetworkOnly` answers with it. The
 *   offline page answers only when the network fails, never for an HTTP error.
 * - Hashed bundles are cache-first, other static files stale-while-revalidate;
 *   both store only what `isStorable` accepts.
 * - A first install controls the open pages at once; an update waits until
 *   the page posts `SKIP_WAITING`.
 */
export function startWorker(options: WorkerOptions): void {
	const plan = workerPlan(options, injectedPrecache());
	const scope = workerScope();
	const { contract } = options;
	setCacheNameDetails(plan.cacheNameDetails);
	precacheAndRoute([...plan.precache], {
		cleanURLs: false,
		directoryIndex: '',
	});
	if (plan.navigationPreload) navigationPreload.enable();

	for (const route of plan.routes) {
		const match = matcher(route.caching, () => scope.location.origin, options);
		if (route.strategy === 'network-only') {
			const { fallback } = route;
			registerRoute(
				match,
				new NetworkOnly({
					plugins: fallback
						? [{ handlerDidError: async () => matchPrecache(fallback) }]
						: [],
				}),
			);
			continue;
		}
		const Strategy =
			route.strategy === 'cache-first' ? CacheFirst : StaleWhileRevalidate;
		registerRoute(
			match,
			new Strategy({
				cacheName: route.cacheName,
				plugins: [
					storableOnly,
					new ExpirationPlugin({
						...route.expiration,
						purgeOnQuotaError: true,
					}) as WorkboxPlugin, // ExpirationPlugin's optional hooks are not exact-optional under exactOptionalPropertyTypes; this states it is a plugin.
				],
			}),
		);
	}

	clientsClaim();
	scope.addEventListener('activate', (event) => {
		event.waitUntil(deleteObsoleteCaches(contract, caches));
	});
	scope.addEventListener('message', (event) => {
		if (isSkipWaiting(event.data)) void scope.skipWaiting();
	});
}
