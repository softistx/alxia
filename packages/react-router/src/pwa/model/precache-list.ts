/**
 * What the service worker precaches, read from a build: every script and
 * stylesheet React Router's manifest names (the client entry and each
 * route's module, imports and CSS), and the manifest itself, so a client
 * navigation offline to a route never visited still finds its code. Only
 * hashed `/assets/` files: a new build names new files, so each precaches
 * under its own URL, revision `null`. Chunks only a component loads on
 * demand stay out: a cache-first route stores them the first time they load.
 *
 * Dependency-free: a build script runs it at build time.
 */

/** A route or the entry, as `window.__reactRouterManifest` lists it. */
type ManifestModule = { module?: string; imports?: string[]; css?: string[] };

/** The parts of React Router's browser manifest the list reads. */
export type BrowserManifest = {
	url: string;
	entry: ManifestModule;
	routes: Record<string, ManifestModule>;
};

/** A Workbox precache entry: a hashed URL needs no revision. */
export type PrecacheEntry = { url: string; revision: string | null };

/** A Vite-hashed file under `/assets/`: `name-<8 hash chars>.js|css`. */
const HASHED_ASSET = /^\/assets\/[^/]+-[\w-]{8}\.(?:js|css)$/;

/** Reads `window.__reactRouterManifest={…};` (build/client/assets/manifest-*.js). */
export function parseBrowserManifest(source: string): BrowserManifest {
	const start = source.indexOf('{');
	const end = source.lastIndexOf('}');
	if (start < 0 || end < start) {
		throw new Error(
			"parseBrowserManifest(): not React Router's browser manifest (build/client/assets/manifest-*.js).",
		);
	}
	return JSON.parse(source.slice(start, end + 1)) as BrowserManifest;
}

/** The hashed scripts and stylesheets every route needs, the manifest's own file first. */
export function precacheList(manifest: BrowserManifest): PrecacheEntry[] {
	const urls = new Set<string>([manifest.url]);
	for (const part of [manifest.entry, ...Object.values(manifest.routes)]) {
		for (const url of [
			...(part.module ? [part.module] : []),
			...(part.imports ?? []),
			...(part.css ?? []),
		]) {
			urls.add(url);
		}
	}
	return [...urls]
		.filter((url) => HASHED_ASSET.test(url))
		.map((url) => ({ url, revision: null }));
}

/**
 * The precache entries of the files among `assetFiles` (the names in
 * build/client/assets) that `include` matches, sorted, under `base`: fonts
 * an app keeps offline, say. The regex is the app's.
 */
export function assetPrecache(
	assetFiles: readonly string[],
	include: RegExp,
	base = '/assets/',
): PrecacheEntry[] {
	return assetFiles
		.filter((file) => include.test(file))
		.sort()
		.map((file) => ({ url: `${base}${file}`, revision: null }));
}
