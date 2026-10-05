import {
	isHealthRoute,
	joinPath,
	type RouteDefinition,
	type RouteOperation,
	type RoutePath,
	shapeOf,
} from '@alxia/core';
import { isApiDocsRoute } from './api-docs';

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
	 * each operation's path is looked up under it. Written as the app's: a
	 * leading `/`, and no trailing one.
	 */
	readonly prefix?: RoutePath;
}

export interface MatchesSpecOptions extends ImplementedOptions {
	/**
	 * A route no operation has to declare. The routes of `apiDocs()` and
	 * the probes of `@alxia/core`'s `health()` are left out already.
	 */
	readonly exclude?: (route: RouteDefinition) => boolean;
}

/**
 * Any `alxia()` app: its routes, with their full paths. The public
 * signatures spell it out, so that `tsc` names the shape, not this alias.
 */
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
	const missing = unrouted(
		app,
		wanted('implemented', operations, options.prefix),
	);
	if (missing.length > 0) {
		throw new TypeError(`implemented(): ${noRoute(missing)}`);
	}
}

/**
 * Throws a `TypeError` unless `app` and `operations` match both ways: each
 * operation with no route, as `implemented` lists it, and each route of
 * `app` that no operation declares, `exclude` aside. One call checks both;
 * `implemented` alone is for an app that serves more than its document.
 */
export function matchesSpec(
	app: { readonly routes: readonly RouteDefinition[] },
	operations: Operations,
	options: MatchesSpecOptions = {},
): void {
	match('matchesSpec', app, operations, options);
}

function match(
	check: 'matchesSpec',
	app: Routed,
	operations: Operations,
	options: MatchesSpecOptions,
): void {
	const all = wanted(check, operations, options.prefix);
	const missing = unrouted(app, all);
	const declared = new Set(all.map(keyOf));
	const extra = app.routes.filter(
		(route) =>
			!declared.has(keyOf(route)) &&
			!isApiDocsRoute(route) &&
			!isHealthRoute(route) &&
			!(options.exclude?.(route) ?? false),
	);
	const parts: string[] = [];
	if (missing.length > 0) parts.push(noRoute(missing));
	if (extra.length > 0) parts.push(noOperation(extra));
	if (parts.length > 0) throw new TypeError(`${check}(): ${parts.join('; ')}`);
}

function wanted(
	check: 'implemented' | 'matchesSpec',
	operations: Operations,
	prefix = '',
): Wanted[] {
	// As the core refuses one: a typed prefix can still be '/api/'.
	if (prefix !== '' && !/^\/.*[^/]$/.test(prefix)) {
		throw new TypeError(
			`${check}(): the prefix "${prefix}" must start with "/" and not end with one`,
		);
	}
	const named: [string | undefined, RouteOperation][] = Array.isArray(
		operations,
	)
		? operations.map((operation) => [
				operation.schema?.detail?.operationId,
				operation,
			])
		: Object.entries(operations);
	return named.map(([name, operation]) => {
		const path = joinPath(prefix, operation.path);
		try {
			shapeOf(path);
		} catch (error) {
			// No route may be declared there: say so, named by the check.
			throw new TypeError(`${check}(): ${(error as Error).message}`);
		}
		return { method: operation.method, path, name };
	});
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

/**
 * A method and a path's shape: `/pets/:id` serves what `/pets/:petId`
 * declares, as the router matches them alike.
 */
function keyOf(route: { readonly method: string; readonly path: string }) {
	return `${route.method} ${shapeOf(route.path)}`;
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
