/**
 * `proxy(target, options)`: a middleware that forwards the requests it runs
 * on to an upstream fixed here — one, or a list taken round-robin. `proxy.mount(prefix, target)`: a plugin
 * forwarding everything under a prefix. `proxy.ws(target)`: the handlers
 * of a socket route relayed to an upstream WebSocket.
 */
import {
	type Alxia,
	alxia,
	definePlugin,
	type Empty,
	type Middleware,
	markFactory,
	type RequiresOf,
	type Requiring,
} from '@alxia/core';
import { forward } from './forward';
import type { ProxyContext, ProxyOptions } from './options';
import {
	type SocketProxy,
	type SocketProxyOptions,
	socketProxy,
} from './socket';
import { type ProxyTargets, poolOf } from './upstreams';

/**
 * What `proxy()` makes: a middleware that never calls `next`, requiring of
 * the context in force what its `headers` callbacks read.
 */
export type ProxyMiddleware<Ctx = unknown> = Middleware<
	RequiresOf<Ctx, 'headers'>,
	Promise<Response>
>;

/** What `proxy.mount()` makes: a plugin app under `Prefix`, requiring what its callbacks read. */
export type ProxyMount<Prefix extends string, Ctx = unknown> = Alxia<
	Empty,
	Prefix
> &
	Requiring<RequiresOf<Ctx, 'headers'>>;

/**
 * Forwards every request it runs on to `target`, an absolute `http://` or
 * `https://` URL fixed here: the method, the headers but the hop-by-hop
 * ones, the body and the response streamed both ways, the query string
 * kept. The middlewares before it — auth, rate limit, cache, logger —
 * run first. A 502 when the upstream cannot be reached, a 504 past
 * `timeout`, in the app's error format.
 *
 * `target` may be a list: each request goes to the next upstream, and to
 * another one when the connect to the first was refused or its host did
 * not resolve (`retries`), skipping for `cooldown` ms one that failed so.
 *
 * ```ts
 * app.use(bearer({ jwt })).use('/api', proxy('http://users.internal:8080', { rewrite: '/api' }));
 * app.use('/api', proxy(['http://users-1:8080', 'http://users-2:8080'], { rewrite: '/api' }));
 * ```
 */
function proxy<Ctx = unknown>(
	target: ProxyTargets,
	options: ProxyOptions<Ctx> = {},
): ProxyMiddleware<Ctx> {
	const pool = poolOf<Ctx>('proxy()', target, options);
	return async function proxy(ctx) {
		return forward(pool, ctx as unknown as ProxyContext<Ctx>);
	};
}

/**
 * A plugin forwarding every request under `prefix`, whatever its method or
 * path, to `target` (one upstream, or a list as for `proxy()`): the prefix stripped, and the upstream's redirects and
 * cookies rebased under it. Mounted after the app's middlewares, it runs
 * behind them.
 *
 * ```ts
 * app.plugin(proxy.mount('/legacy', 'http://old-app:3000'));
 * ```
 */
function mount<const Prefix extends `/${string}`, Ctx = unknown>(
	prefix: Prefix,
	target: ProxyTargets,
	options: ProxyOptions<Ctx> = {},
): ProxyMount<Prefix, Ctx> {
	if ((prefix as string) === '/' || prefix.endsWith('/')) {
		throw new TypeError(
			`proxy.mount(): the prefix must start with "/" and not end with one; got "${prefix}"`,
		);
	}
	const middleware = proxy<Ctx>(target, {
		...options,
		rewrite: options.rewrite ?? prefix,
		rebase:
			options.rebase === undefined || options.rebase === true
				? prefix
				: options.rebase,
	});
	const plugin = definePlugin<RequiresOf<Ctx, 'headers'>>()(() =>
		alxia({ prefix }).use(middleware as Middleware<Empty, Promise<Response>>),
	);
	return plugin as unknown as ProxyMount<Prefix, Ctx>;
}

/**
 * The handlers of a socket route relayed to `target`, a `ws://` or
 * `wss://` URL (`http`, `https` taken as such), or a list of them taken
 * round-robin, the connect retried on the next one as for `proxy()`: each
 * frame both ways, and the close codes.
 *
 * ```ts
 * app.ws('/live', proxy.ws('ws://chat.internal:8080', { rewrite: '/live' }));
 * ```
 */
function ws<Ctx = unknown>(
	target: ProxyTargets,
	options: SocketProxyOptions<Ctx> = {},
): SocketProxy<Ctx> {
	return socketProxy(target, options);
}

markFactory(proxy);
markFactory(mount, 'plugin');

const exported: typeof proxy & {
	readonly mount: typeof mount;
	readonly ws: typeof ws;
} = Object.assign(proxy, { mount, ws });

export { exported as proxy };
