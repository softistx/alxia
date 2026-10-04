/**
 * The runtime an app is built into: made from its options, and filled with
 * the global hooks of the plugins it uses.
 */
import { joinPath } from '../router/paths';
import { Router } from '../router/router';
import type { Globals, Runtime } from './definition';
import { addPage } from './pages';
import type { AlxiaOptions } from './signatures';

/**
 * A new app's runtime: no route, no global hook; `unmatched` reads the
 * chain of its scope.
 */
export function createRuntime(
	options: AlxiaOptions<string>,
	unmatched: Runtime['unmatched'],
): Runtime {
	return {
		router: new Router(),
		unmatched,
		globals: {
			around: [],
			onRequest: [],
			onResponse: [],
			onStart: [],
			onStop: [],
			parsers: [],
			pages: new Map(),
		},
		validateResponses: options.validateResponses ?? true,
		ip:
			options.ip ??
			((request, server) => server?.requestIP(request)?.address ?? undefined),
	};
}

/**
 * A plugin's global hooks, after the app's, and its pages under the app's
 * `prefix`. Nothing when the plugin shares the app's globals.
 */
export function mergeGlobals(
	runtime: Runtime,
	globals: Globals,
	prefix: string,
): void {
	if (globals === runtime.globals) return;
	runtime.globals.around.push(...globals.around);
	runtime.globals.onRequest.push(...globals.onRequest);
	runtime.globals.onResponse.push(...globals.onResponse);
	runtime.globals.onStart.push(...globals.onStart);
	runtime.globals.onStop.push(...globals.onStop);
	runtime.globals.parsers.push(...globals.parsers);
	for (const [path, bundle] of globals.pages) {
		addPage(runtime, joinPath(prefix, path), bundle);
	}
}
