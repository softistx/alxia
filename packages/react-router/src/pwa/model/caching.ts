import { SERVICE_WORKER_URL } from './worker-contract';

/**
 * Which requests the service worker caches, and how. Pure, so that what is
 * never cached is tested, not hoped for.
 *
 * - `navigation`: a page load. Always from the network, never stored; the
 *   offline page answers only when the network fails.
 * - `immutable`: a hashed bundle: cache-first.
 * - `static`: another same-origin static file (icon, sprite, logo):
 *   stale-while-revalidate.
 * - `none`: left to the browser, untouched: every non-GET, any other
 *   origin, React Router's `.data` and `/__manifest`, the worker and the
 *   manifest themselves, the app's own `never` paths, and anything carrying
 *   credentials.
 */
export type Caching = 'navigation' | 'immutable' | 'static' | 'none';

/** What a `Request` exposes that the decision reads. */
export interface RequestFacts {
	readonly method: string;
	readonly url: string;
	readonly mode: string;
	readonly destination: string;
	readonly headers: Pick<Headers, 'has'>;
}

export interface CachingOptions {
	/** The worker's own path, never cached. `SERVICE_WORKER_URL` by default. */
	serviceWorkerUrl?: string;
	/** The web app manifest's path, never cached. `'/manifest.webmanifest'` by default. */
	manifestPath?: string;
	/** Paths of the app answered fresh every time, such as `(p) => p.startsWith('/api/')`. */
	never?: (path: string) => boolean;
	/**
	 * Which static paths are immutable (cache-first) rather than static.
	 * `(path) => path.startsWith('/assets/')` by default, as `serveClient`
	 * serves them.
	 */
	immutable?: (path: string) => boolean;
}

const STATIC_EXTENSION =
	/\.(?:js|mjs|css|woff2?|ttf|otf|svg|png|jpe?g|webp|avif|gif|ico)$/i;

const underAssets = (path: string) => path.startsWith('/assets/');

/** How the worker answers `request`, for an app served at `origin`. */
export function cachingFor(
	request: RequestFacts,
	origin: string,
	options: CachingOptions = {},
): Caching {
	if (request.method !== 'GET') return 'none';
	if (request.mode === 'navigate') return 'navigation';
	const url = new URL(request.url);
	if (url.origin !== origin) return 'none';
	if (request.headers.has('authorization')) return 'none';
	if (url.search) return 'none';
	const path = url.pathname;
	if (
		path.endsWith('.data') || // React Router single fetch: loader data
		path === '/__manifest' || // React Router route discovery
		path === (options.serviceWorkerUrl ?? SERVICE_WORKER_URL) ||
		path === (options.manifestPath ?? '/manifest.webmanifest') ||
		options.never?.(path)
	) {
		return 'none';
	}
	if (request.destination === 'document' || request.destination === 'iframe')
		return 'none';
	if (!STATIC_EXTENSION.test(path)) return 'none';
	return (options.immutable ?? underAssets)(path) ? 'immutable' : 'static';
}
