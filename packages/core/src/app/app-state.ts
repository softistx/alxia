/**
 * What an app holds — its prefix, its runtime, its routes and socket routes,
 * the middlewares in force — and how a route or a socket route enters it.
 */

import { refuseTwice } from './declared-twice';
import type { RouteDefinition, Runtime, SocketDefinition } from './definition';
import { refusePage } from './pages';
import { createRuntime } from './runtime';
import { Scope } from './scope';
import type { AlxiaOptions } from './signatures';

export interface AppState {
	/** What the app was made with: what `fork()` makes its copy with. */
	readonly options: AlxiaOptions<string>;
	readonly prefix: string;
	/** The routes, the lifecycle hooks and the options a request is served with. */
	runtime: Runtime;
	readonly routes: RouteDefinition[];
	readonly sockets: SocketDefinition[];
	/** The middlewares in force for the routes declared next. */
	scope: Scope;
	/** Whether `late-use.ts` warned already: once per app. */
	warnedLate?: boolean;
}

/** A new app's state; a prefix that does not start with "/", or ends with one, throws. */
export function createState(options: AlxiaOptions<string>): AppState {
	const prefix = options.prefix ?? '';
	const state: AppState = {
		options,
		prefix,
		runtime: createRuntime(options, () => state.scope.unmatched()),
		routes: [],
		sockets: [],
		scope: new Scope(),
	};
	if (prefix !== '' && !/^\/.*[^/]$/.test(prefix)) {
		throw new TypeError(
			`The prefix "${prefix}" must start with "/" and not end with one`,
		);
	}
	return state;
}

/** Adds a route at its full path, unless a page serves it. */
export function register(state: AppState, route: RouteDefinition): void {
	refusePage(state.runtime, route.method, route.path);
	refuseTwice(
		state.runtime.router,
		route.method,
		route.path,
		(declared) =>
			declared.kind === 'http' && declared.handler === route.handler,
	);
	state.runtime.router.add(route.method, route.path, {
		kind: 'http',
		...route,
	});
	state.routes.push(route);
}

/** Adds a socket route at its full path, unless a page serves it. */
export function mount(state: AppState, socket: SocketDefinition): void {
	refusePage(state.runtime, 'WS', socket.path);
	refuseTwice(
		state.runtime.router,
		'WS',
		socket.path,
		(declared) =>
			declared.kind === 'ws' && declared.handlers === socket.handlers,
	);
	state.runtime.router.add('WS', socket.path, { kind: 'ws', ...socket });
	state.sockets.push(socket);
}
