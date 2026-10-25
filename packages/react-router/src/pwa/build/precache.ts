import { createHash } from 'node:crypto';
import {
	assetPrecache,
	type PrecacheEntry,
	parseBrowserManifest,
	precacheList,
} from '../model/precache-list';

/** The one React Router browser manifest among the names in build/client/assets. */
export function browserManifestFile(files: readonly string[]): string {
	const found = files.filter((file) => /^manifest-[\w-]+\.js$/.test(file));
	const [only] = found;
	if (found.length !== 1 || only === undefined) {
		throw new Error(
			`buildWorker(): expected one React Router browser manifest, build/client/assets/manifest-*.js, found ${found.length}. Run react-router build first.`,
		);
	}
	return only;
}

/** A file's revision: the first 16 hex characters of its sha256. */
export function revisionOf(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex').slice(0, 16);
}

/**
 * The worker's precache list: the offline page (revisioned by its content),
 * every route's code, then the asset files `include` matches. Each URL once,
 * the first kept.
 */
export function workerPrecache(input: {
	manifestSource: string;
	assetFiles: readonly string[];
	offline?: PrecacheEntry | undefined;
	include?: RegExp | undefined;
}): PrecacheEntry[] {
	const all = [
		...(input.offline ? [input.offline] : []),
		...precacheList(parseBrowserManifest(input.manifestSource)),
		...(input.include ? assetPrecache(input.assetFiles, input.include) : []),
	];
	const seen = new Set<string>();
	return all.filter(({ url }) => !seen.has(url) && seen.add(url));
}
