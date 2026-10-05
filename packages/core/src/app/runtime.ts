/**
 * The runtime an app is built into: made from its options, and filled with
 * the lifecycle hooks and parsers of the plugins it uses.
 */

import type { ErrorFormat } from '../errors/problems';
import { joinPath } from '../router/paths';
import { Router } from '../router/router';
import type { Globals, Runtime } from './definition';
import { addPage } from './pages';
import type { AlxiaOptions } from './signatures';

/**
 * A new app's runtime: no route, no lifecycle hook; `unmatched` reads the
 * chain of its scope.
 */
export function createRuntime(
	options: AlxiaOptions<string>,
	unmatched: Runtime['unmatched'],
): Runtime {
	return {
		router: new Router(),
		unmatched,
		globals: { onStart: [], onStop: [], parsers: [], pages: new Map() },
		validateResponses: options.validateResponses ?? true,
		served: { errors: errorFormatOf(options), closing: new AbortController() },
		sockets: new Set(),
		ip:
			options.ip ??
			((request, server) => server?.requestIP(request)?.address ?? undefined),
	};
}

/**
 * A plugin's lifecycle hooks and parsers, after the app's, and its pages under the app's
 * `prefix`. Nothing when the plugin shares the app's globals.
 */
export function mergeGlobals(
	runtime: Runtime,
	globals: Globals,
	prefix: string,
): void {
	if (globals === runtime.globals) return;
	runtime.globals.onStart.push(...globals.onStart);
	runtime.globals.onStop.push(...globals.onStop);
	runtime.globals.parsers.push(...globals.parsers);
	for (const [path, bundle] of globals.pages) {
		addPage(runtime, joinPath(prefix, path), bundle);
	}
}

/** The `errors` option, `json` unless given; anything else throws. */
function errorFormatOf(options: AlxiaOptions<string>): ErrorFormat {
	const errors = options.errors ?? 'json';
	if (errors !== 'json' && errors !== 'problem') {
		throw new TypeError(
			`alxia(): errors must be 'json' or 'problem', not ${JSON.stringify(errors)}`,
		);
	}
	return errors;
}
