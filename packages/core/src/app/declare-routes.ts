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
import { routeHooks } from './define-hook';
import { addPage } from './pages';
import { routeArgs } from './route-method';
import { operationArgs, type RouteOperation } from './route-operation';
import type { Method } from './types';

/** `app[method](path, ...rest)`: a route, behind the hooks in force. */
export function addRoute(
	state: AppState,
	method: Method,
	path: string,
	...rest: unknown[]
): void {
	const { list, schema, handler } = routeArgs(method, path, rest);
	const full = joinPath(state.prefix, path);
	const label = `${method} ${full}`;
	const bodyLimit = state.scope.bodyLimitOf(schema, label);
	register(state, {
		method,
		path: full,
		schema,
		...(bodyLimit === undefined ? {} : { bodyLimit }),
		handler,
		...state.scope.hooks(routeHooks(list, label)),
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

/** `app.ws(path, [hooks]?, schema, handlers)`: a socket route, behind the hooks in force. */
export function addSocket(
	state: AppState,
	path: string,
	...rest:
		| [SocketSchema, SocketHandlers<never, never, never>]
		| [readonly unknown[], SocketSchema, SocketHandlers<never, never, never>]
): void {
	const [list, schema, handlers] =
		rest.length === 3 ? rest : ([[], ...rest] as const);
	const full = joinPath(state.prefix, path);
	mount(state, {
		path: full,
		schema,
		handlers,
		...state.scope.hooks(routeHooks(list, `WS ${full}`)),
	});
}
