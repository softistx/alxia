/**
 * The runtime an app is built into: made from its options, and filled with
 * the lifecycle hooks and parsers of the plugins it uses.
 */

import { devOf } from '../dev/mode';
import type { ErrorFormat } from '../errors/problems';
import { canonicalIp } from '../request/ip-address';
import { joinPath } from '../router/paths';
import { Router } from '../router/router';
import type { ChainHook, Definition, Globals, Runtime } from './definition';
import { addPage } from './pages';
import type { ScopedHooks } from './scope';
import type { AlxiaOptions } from './signatures';

/**
 * A new app's runtime: no route, no lifecycle hook; `unmatched` reads the
 * chain of its scope.
 */
export function createRuntime(
	options: AlxiaOptions<string>,
	unmatched: Runtime['unmatched'],
): Runtime {
	const router = new Router<Definition>();
	const dev = devOf(options.dev);
	const globals: Globals = {
		onStart: [],
		onStop: [],
		parsers: [],
		pages: new Map(),
	};
	return {
		router,
		unmatched,
		globals,
		validateResponses: options.validateResponses ?? true,
		served: {
			errors: errorFormatOf(options),
			closing: new AbortController(),
			dev,
			...(dev
				? { declared: () => declaredOf(router, globals, unmatched()) }
				: {}),
		},
		sockets: new Set(),
		ip:
			options.ip ??
			((request, server) => {
				const address = server?.requestIP(request)?.address;
				return address ? socketIp(address) : undefined;
			}),
		proxy: proxyOf(options),
	};
}

/** The socket addresses last seen, canonical: a client's next request reads its own. */
const SEEN = new Map<string, string>();

/** A socket's address in its one text, remembered for the next requests of the same client. */
function socketIp(address: string): string {
	let canonical = SEEN.get(address);
	if (canonical === undefined) {
		canonical = canonicalIp(address);
		if (SEEN.size >= 1024) SEEN.clear();
		SEEN.set(address, canonical);
	}
	return canonical;
}

/** The `proxy` option; given with `ip`, which it replaces, it throws. */
function proxyOf(options: AlxiaOptions<string>): Runtime['proxy'] {
	if (options.proxy === undefined) return undefined;
	if (options.ip !== undefined)
		throw new TypeError(
			'alxia(): give ip or proxy, not both: proxy reads ctx.ip itself',
		);
	if (typeof options.proxy !== 'function')
		throw new TypeError('alxia(): proxy must be trustProxy({ trusted })');
	return options.proxy;
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

/**
 * Every method and path a 404's hint may offer, its pages as `GET`s: the
 * routes whose chain runs nothing beyond the app-wide middlewares and
 * `derive`s, which the request already passed on its way to the 404. A
 * route behind a group's, a prefixed plugin's, a `use(path, …)`'s or its
 * own middleware is never named: the hint would reveal what that guard
 * keeps from a client who has not passed it.
 */
function* declaredOf(
	router: Router<Definition>,
	globals: Globals,
	unmatched: ScopedHooks,
): Generator<readonly [method: string, path: string]> {
	const passed = new Set<ChainHook>(
		unmatched.derive.filter((hook) => !('when' in hook && hook.when)),
	);
	const open = (hook: ChainHook) =>
		hook.kind === 'validate' || hook.kind === 'responds' || passed.has(hook);
	for (const [path, methods] of router.paths()) {
		for (const [method, definition] of methods) {
			if (method === 'WS' || !definition.derive.every(open)) continue;
			yield [method, path];
		}
	}
	for (const path of globals.pages.keys()) yield ['GET', path];
}
