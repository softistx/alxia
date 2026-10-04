/**
 * How each kind of route enters an app, its arguments read as its method
 * receives them: a route, a route declared as data, a directory, a file, a
 * page and a socket route.
 */
import { joinPath } from '../router/paths';
import { fileHandler, staticHandler } from '../static/serve';
import type { FileOptions, FileSource, StaticOptions } from '../static/types';
import type { SocketHandlers, SocketSchema } from '../ws/types';
import { type AppState, mount, register } from './app-state';
import type { RouteDefinition } from './definition';
import { addPage } from './pages';
import { operationArgs, type RouteOperation } from './route-operation';
import { routeArgs, routeChain } from './route-steps';
import type { Method } from './types';

/** `app[method](path, ...rest)`: a route, behind the hooks in force. */
export function addRoute(
	state: AppState,
	method: Method,
	path: string,
	...rest: unknown[]
): void {
	const full = joinPath(state.prefix, path);
	const label = `${method} ${full}`;
	const args = routeArgs(
		`${method} ${path}`,
		rest,
		(last): last is RouteDefinition['handler'] => typeof last === 'function',
		'handler',
	);
	const { derive, schema } = routeChain(label, args);
	const bodyLimit = state.scope.bodyLimitOf(schema, label);
	register(state, {
		method,
		path: full,
		schema,
		...(bodyLimit === undefined ? {} : { bodyLimit }),
		handler: args.last,
		...state.scope.hooks(derive),
	});
}

/** `app.route(operation, ...rest)`: `app[method](path, ...)`, read from `operation`. */
export function addOperation(
	state: AppState,
	operation: RouteOperation,
	...rest: unknown[]
): void {
	addRoute(
		state,
		operation.method,
		operation.path,
		...operationArgs(operation, rest),
	);
}

/** `app.static(path, source, options?)`: a `GET` route at `path/*`. */
export function addStatic(
	state: AppState,
	path: string,
	source: FileSource,
	options: StaticOptions = {},
): void {
	const route = path === '/' ? '/*' : `${path}/*`;
	addRoute(state, 'GET', route, staticHandler(source, options));
}

/** `app.file(path, file, options?)`: a `GET` route at `path`. */
export function addFile(
	state: AppState,
	path: string,
	file: Parameters<typeof fileHandler>[0],
	options: FileOptions = {},
): void {
	addRoute(state, 'GET', path, fileHandler(file, options));
}

/** `app.page(path, bundle)`: a page at its full path. */
export function addPageAt(
	state: AppState,
	path: string,
	bundle: Bun.HTMLBundle,
): void {
	addPage(state.runtime, joinPath(state.prefix, path), bundle);
}

/**
 * `app.ws(path, options?, ...middlewares, handlers)`, or `app.ws(path,
 * [hooks]?, schema, handlers)`: a socket route, behind the hooks in force.
 */
export function addSocket(
	state: AppState,
	path: string,
	...rest: unknown[]
): void {
	const full = joinPath(state.prefix, path);
	const label = `WS ${full}`;
	const args = routeArgs(
		label,
		rest,
		(last): last is SocketHandlers<never, never, never> =>
			last !== null && typeof last === 'object' && !Array.isArray(last),
		'handlers object',
	);
	const { derive, schema } = routeChain(label, args, true);
	mount(state, {
		path: full,
		schema: schema as SocketSchema,
		handlers: args.last,
		...state.scope.hooks(derive),
	});
}
