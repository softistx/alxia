/** The define key the build sets: the worker's precache list, as JSON. */
export const PRECACHE_DEFINE = 'globalThis.__ALXIA_PRECACHE__';

/** One file the worker precaches: its URL and a revision (`null` when hashed in the name). */
type Entry = { readonly url: string; readonly revision: string | null };

/**
 * The precache list the build wrote into this worker, or `undefined` when the
 * worker did not go through the build. Read through `globalThis`, so a missing
 * define is `undefined`, never a `ReferenceError`.
 */
export function injectedPrecache(): readonly Entry[] | undefined {
	return (globalThis as { __ALXIA_PRECACHE__?: readonly Entry[] })
		.__ALXIA_PRECACHE__;
}
