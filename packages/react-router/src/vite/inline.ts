import { fileURLToPath } from 'node:url';

/**
 * The subpaths the server build bundles even when the app lists this package
 * in `ssr.external` (a linked workspace does). `/entry` renders
 * `ServerRouter`, and the root's `<Links>` and `<Scripts>` read the context
 * it provides: both must be the same `react-router` copy, and the build
 * bundles the app's. An external `/entry` would import another one from
 * `node_modules`. `/document` goes with it, so that `DocumentNonce` and
 * `useNonce()` are one context in one graph. An installed package is not
 * in that case: `resolve.noExternal: true` bundles it whole.
 */
const INLINED = new Set([
	'@alxia/react-router/entry',
	'@alxia/react-router/document',
]);

/** The file of a subpath that must not be external, as an absolute path. */
export function inlinedFile(id: string): string | undefined {
	if (!INLINED.has(id)) return undefined;
	try {
		return fileURLToPath(import.meta.resolve(id));
	} catch {
		return undefined;
	}
}
