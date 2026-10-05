/**
 * `app.fork()`: a copy of an app that shares nothing it declares on with it,
 * so that one base builds several apps — the real one, a spec's, a variant.
 */
import { type AppState, mount, register } from './app-state';
import { mergeGlobals } from './runtime';

/**
 * Declares on `into`, a new app made with `from`'s options, everything
 * `from` holds: its routes and socket routes, its chain in force, its
 * lifecycle hooks, parsers and pages. What either declares next stays its own.
 */
export function forkInto(from: AppState, into: AppState): void {
	for (const route of from.routes) register(into, route);
	for (const socket of from.sockets) mount(into, socket);
	into.scope = from.scope.fork();
	mergeGlobals(into.runtime, from.runtime.globals, '');
	if (from.warnedLate) into.warnedLate = true;
}
