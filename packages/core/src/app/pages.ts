/**
 * Bun's HTML bundles an app declares with `page`: `listen` serves one before
 * any route at its path, so a page and a route never share a path's shape.
 */
import { shapeOf } from '../router/paths';
import type { Runtime } from './definition';

/** Declares a page at its full path, unless something serves that path. */
export function addPage(
	runtime: Runtime,
	path: string,
	bundle: Bun.HTMLBundle,
): void {
	if (pageAt(runtime, path) !== undefined || runtime.router.hasShape(path)) {
		throw new TypeError(`page(): ${path} is already served`);
	}
	runtime.globals.pages.set(path, bundle);
}

/** Refuses a route at a path a page serves. */
export function refusePage(
	runtime: Runtime,
	method: string,
	path: string,
): void {
	if (pageAt(runtime, path) !== undefined) {
		throw new TypeError(`${method} ${path} is already served by a page`);
	}
}

/**
 * Refuses a page declared since `before` at a path this app's routes serve:
 * a group checks its pages against its own routes only.
 */
export function refuseShadowedPages(
	runtime: Runtime,
	before: ReadonlySet<string>,
): void {
	for (const path of runtime.globals.pages.keys()) {
		if (!before.has(path) && runtime.router.hasShape(path)) {
			throw new TypeError(`page(): ${path} is already served`);
		}
	}
}

/** The page declared at a path of the same shape as `path`. */
function pageAt(runtime: Runtime, path: string): string | undefined {
	const shape = shapeOf(path);
	for (const page of runtime.globals.pages.keys()) {
		if (shapeOf(page) === shape) return page;
	}
	return undefined;
}
