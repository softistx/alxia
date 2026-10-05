import {
	type BaseContext,
	defineMiddleware,
	type Empty,
	type Middleware,
	markFactory,
	type Next,
} from '@alxia/core';
import { requestControls } from './control';
import { type Loaded, refreshBehind, singleFlight } from './flight';
import { storeGuard } from './guard';
import { type KeyedBy, keepable, shareable, toCached } from './keep';
import { defaultKey, pathTag } from './keys';
import { bypasses, freshness } from './lookup';
import { respond } from './respond';
import { type CacheStore, MemoryCacheStore } from './store';

/**
 * `Requires` is what `key` and `tags` read from the context beyond
 * `BaseContext` — a `user` an earlier middleware adds — and what the app that
 * uses the cache must then give.
 */
export interface CacheOptions<Requires extends object = Empty> {
	/** Seconds a response is fresh. */
	readonly ttl: number;
	/**
	 * Seconds a response is served stale after, while one request refreshes
	 * it in the background: no client waits for a slow route. None by default.
	 */
	readonly staleWhileRevalidate?: number;
	/** Where responses are kept: this process's memory by default. */
	readonly store?: CacheStore;
	/**
	 * The key of a request: its path and query by default, and the headers
	 * in `vary`. `undefined` is not cached: a request with a session, say.
	 */
	readonly key?: (ctx: BaseContext & Requires) => string | undefined;
	/** Request headers the response varies by: `accept-language`. Each is part of the key, and of `Vary`. */
	readonly vary?: readonly string[];
	/** The statuses kept. `200` by default; a 404 may be worth keeping too. */
	readonly statuses?: readonly number[];
	/** Tags every response of these routes carries, for `invalidateTag`. */
	readonly tags?: (ctx: BaseContext & Requires) => readonly string[];
	/** Whether `Cache-Control: no-cache` from the client skips the cache. Off by default: a client cannot empty yours. */
	readonly honorClientNoCache?: boolean;
	/** Says `X-Cache: HIT`, `STALE` or `MISS`, and `Age`. On by default. */
	readonly debugHeaders?: boolean;
}

/** What the routes behind the cache read. */
export interface CacheControls {
	/** Tags the response being built, beyond the middleware's `tags`. Tags starting `alxia:` are the cache's own. */
	tag(...tags: string[]): void;
	/** Keeps this response out of the cache. */
	skip(): void;
}

/** A cache of responses, and the hands to empty it. */
export interface Cache {
	/**
	 * Forgets every response kept for `path` — `/users/1?x=y`, as the request
	 * asked it — whatever its key: each `vary` value, a `key` of your own.
	 */
	invalidate(path: string): Promise<void>;
	/** Forgets every response tagged `tag`. */
	invalidateTag(tag: string): Promise<void>;
	readonly store: CacheStore;
}

/**
 * What `cache()` makes: a middleware that requires `Requires` of the app
 * and gives `cache`, with the hands to empty it.
 */
export type CacheMiddleware<Requires extends object = Empty> = Middleware<
	Requires,
	Promise<Response | Next<{ cache: CacheControls }>>
> &
	Cache;

/**
 * Responses kept and served again, as a middleware: a `GET` to a route
 * declared after it is answered from the store while fresh, and from the
 * route otherwise. Concurrent misses run the route once. Stale, it is served at
 * once and refreshed behind. A response that says `no-store` or `private`,
 * sets a cookie, or has another status is never kept; nor is the answer to a
 * request carrying `Authorization` or `Cookie`, unless it says `public`,
 * `s-maxage` or `must-revalidate`, or the key tells senders apart: `vary`
 * naming the header, or, for a cookie, a `key` of the app's own.
 *
 * Every kept response gets a weak `ETag` from its body when it has none, so
 * a client whose copy is current gets a 304.
 *
 * ```ts
 * const products = cache({ ttl: 60, staleWhileRevalidate: 300, tags: () => ['products'] });
 * app.use(products).get('/products', ...);
 * await products.invalidateTag('products');
 * ```
 *
 * A `key` or `tags` that reads what an earlier middleware added names it, and
 * the app must then give it: `cache<{ user: User }>({ tags: ({ user }) => [user.id], … })`.
 */
export function cache<Requires extends object = Empty>(
	options: CacheOptions<Requires>,
): NoInfer<CacheMiddleware<Requires>> {
	const { store, ttl, stale, vary, statuses, debug, honorNoCache, ...keys } =
		settingsOf(options);
	const { keyOf, keyedBy } = keys;
	const controls = requestControls();
	const attempt = storeGuard();
	const flight = singleFlight();

	/** The miss: the route runs, and what it answers is kept when it may be. */
	const keepOnMiss = async (
		key: string,
		ctx: BaseContext & Requires,
		next: () => Promise<Response>,
	): Promise<Loaded> => {
		const response = await next();
		const control = controls.get(ctx.request);
		if (
			!keepable(response, control, statuses) ||
			!shareable(ctx.request, response, keyedBy)
		) {
			return { own: response };
		}
		const cached = await toCached(response, {
			ttl,
			stale,
			vary,
			tags: () => [
				...(options.tags?.(ctx) ?? []),
				...(control?.tags ?? []),
				pathTag(`${ctx.url.pathname}${ctx.url.search}`),
			],
		});
		await attempt(() => store.set(key, cached, ttl + stale), undefined);
		return { kept: cached };
	};
	const load = (
		key: string,
		ctx: BaseContext & Requires,
		next: () => Promise<Response>,
	) => flight.load(key, () => keepOnMiss(key, ctx, next), next);

	const label = (says: 'HIT' | 'STALE' | 'MISS') => (debug ? says : undefined);

	const middleware = defineMiddleware<Requires>()(
		async function cache(ctx, next) {
			const { request } = ctx;
			const added: { cache: CacheControls } = { cache: controls.open(request) };
			// A request no route matches is never kept: there is no route to answer it again.
			const key =
				ctx.route === undefined || bypasses(request, honorNoCache)
					? undefined
					: keyOf(ctx);
			if (key === undefined) return next(added);
			const found = await attempt(() => store.get(key), undefined);
			const worth = found === undefined ? undefined : freshness(found);
			if (found !== undefined && worth === 'fresh') {
				return respond(request, found, label('HIT'));
			}
			if (found !== undefined && worth === 'stale') {
				// Served at once; the route runs behind it, unless a refresh already does.
				if (!flight.has(key)) {
					refreshBehind(load(key, ctx, () => next.behind(added)));
				}
				return respond(request, found, label('STALE'));
			}
			const loaded = await load(key, ctx, () => next(added));
			if (loaded instanceof Response) return loaded;
			return respond(request, loaded, label('MISS'));
		},
	);

	return Object.assign(middleware, handlesOf(store));
}

/** The options with their defaults: milliseconds, lower-case header names, the key of a request and what it tells apart. */
function settingsOf<Requires extends object>(options: CacheOptions<Requires>) {
	const vary = (options.vary ?? []).map((name) => name.toLowerCase());
	const keyedBy: KeyedBy = {
		authorization: vary.includes('authorization'),
		cookie: options.key !== undefined || vary.includes('cookie'),
	};
	return {
		store: options.store ?? new MemoryCacheStore(),
		ttl: options.ttl * 1000,
		stale: (options.staleWhileRevalidate ?? 0) * 1000,
		vary,
		statuses: new Set(options.statuses ?? [200]),
		debug: options.debugHeaders ?? true,
		honorNoCache: options.honorClientNoCache ?? false,
		keyOf:
			options.key ??
			((ctx: BaseContext & Requires) =>
				defaultKey(
					`${ctx.url.pathname}${ctx.url.search}`,
					vary,
					ctx.request.headers,
				)),
		keyedBy,
	};
}

/** The hands to empty a cache: by the path a request asked, or by tag. */
function handlesOf(store: CacheStore): Cache {
	return {
		store,
		invalidate: async (path) => {
			await store.deleteTag(pathTag(path));
		},
		invalidateTag: async (tag) => {
			await store.deleteTag(tag);
		},
	};
}

markFactory(cache);
