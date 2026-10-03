import type { RouteDefinition, RouteOperation } from '@alxia/core';

/**
 * The operations to check: the `operations` object a code generator writes,
 * keyed by operation id, or a list of them.
 */
export type Operations =
	| { readonly [name: string]: RouteOperation }
	| readonly RouteOperation[];

export interface ImplementedOptions {
	/**
	 * The prefix the app gave its routes, `'/api'` for `alxia({ prefix: '/api' })`:
	 * each operation's path is looked up under it.
	 */
	readonly prefix?: string;
}

export interface ExactlyOptions extends ImplementedOptions {
	/** A route no operation has to declare: the document's own, a health check. */
	readonly exclude?: (route: RouteDefinition) => boolean;
}

/** Any `alxia()` app: its routes, with their full paths. */
type Routed = { readonly routes: readonly RouteDefinition[] };

/** An operation as looked up: its method, its full path, and its name. */
interface Wanted {
	readonly method: string;
	readonly path: string;
	readonly name: string | undefined;
}

/**
 * Throws a `TypeError` listing each operation that has no route on `app`, by
 * method and path. Call it in a test, or at startup, once every route is
 * declared.
 */
export function implemented(
	app: { readonly routes: readonly RouteDefinition[] },
	operations: Operations,
	options: ImplementedOptions = {},
): void {
	const missing = unrouted(app, wanted(operations, options.prefix));
	if (missing.length > 0) {
		throw new TypeError(`implemented(): ${noRoute(missing)}`);
	}
}

/**
 * Throws as `implemented` does, and also lists each route of `app` that no
 * operation declares, `exclude` aside.
 */
export function exactly(
	app: { readonly routes: readonly RouteDefinition[] },
	operations: Operations,
	options: ExactlyOptions = {},
): void {
	const all = wanted(operations, options.prefix);
	const missing = unrouted(app, all);
	const declared = new Set(all.map(keyOf));
	const extra = app.routes.filter(
		(route) =>
			!declared.has(keyOf(route)) && !(options.exclude?.(route) ?? false),
	);
	const parts: string[] = [];
	if (missing.length > 0) parts.push(noRoute(missing));
	if (extra.length > 0) parts.push(noOperation(extra));
	if (parts.length > 0) throw new TypeError(`exactly(): ${parts.join('; ')}`);
}

function wanted(operations: Operations, prefix = ''): Wanted[] {
	const named: [string | undefined, RouteOperation][] = Array.isArray(
		operations,
	)
		? operations.map((operation) => [
				operation.schema?.detail?.operationId,
				operation,
			])
		: Object.entries(operations);
	return named.map(([name, operation]) => ({
		method: operation.method,
		path: join(prefix, operation.path),
		name,
	}));
}

/** The operations no route serves. `HEAD` is served by the `GET` route. */
function unrouted(app: Routed, all: readonly Wanted[]): Wanted[] {
	const routed = new Set(app.routes.map(keyOf));
	return all.filter(
		(operation) =>
			!routed.has(keyOf(operation)) &&
			!(
				operation.method === 'HEAD' &&
				routed.has(keyOf({ ...operation, method: 'GET' }))
			),
	);
}

/** As the core joins a prefix: `/` under `/api` is `/api`. */
function join(prefix: string, path: string): string {
	if (prefix === '') return path;
	return path === '/' ? prefix : `${prefix}${path}`;
}

/**
 * A method and a path's shape: `/pets/:id` serves what `/pets/:petId`
 * declares, as the router matches them alike.
 */
function keyOf(route: { readonly method: string; readonly path: string }) {
	return `${route.method} ${route.path.replace(/:[^/]+/g, ':')}`;
}

function noRoute(missing: readonly Wanted[]): string {
	const list = missing
		.map(({ method, path, name }) =>
			name === undefined ? `${method} ${path}` : `${method} ${path} (${name})`,
		)
		.join(', ');
	return missing.length === 1
		? `1 operation has no route: ${list}`
		: `${missing.length} operations have no route: ${list}`;
}

function noOperation(extra: readonly RouteDefinition[]): string {
	const list = extra.map(({ method, path }) => `${method} ${path}`).join(', ');
	return extra.length === 1
		? `1 route has no operation: ${list}`
		: `${extra.length} routes have no operation: ${list}`;
}
