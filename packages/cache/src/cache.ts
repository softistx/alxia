import { vary as addVary, alxia, type BaseContext } from '@alxia/core';
import { defaultKey, pathTag } from './keys';
import { respond } from './respond';
import {
	type CachedResponse,
	type CacheStore,
	MemoryCacheStore,
} from './store';

export interface CacheOptions {
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
	readonly key?: (ctx: BaseContext) => string | undefined;
	/** Request headers the response varies by: `accept-language`. Each is part of the key, and of `Vary`. */
	readonly vary?: readonly string[];
	/** The statuses kept. `200` by default; a 404 may be worth keeping too. */
	readonly statuses?: readonly number[];
	/** Tags every response of these routes carries, for `invalidateTag`. */
	readonly tags?: (ctx: BaseContext) => readonly string[];
	/** Whether `Cache-Control: no-cache` from the client skips the cache. Off by default: a client cannot empty yours. */
	readonly honorClientNoCache?: boolean;
	/** Says `X-Cache: HIT`, `STALE` or `MISS`, and `Age`. On by default. */
	readonly debugHeaders?: boolean;
}

/** What the routes behind the cache read. */
export interface CacheControls {
	/** Tags the response being built, beyond the plugin's `tags`. Tags starting `alxia:` are the plugin's own. */
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

/** Response headers that make a response someone's own. */
const PRIVATE = /\b(no-store|private)\b/i;

/** What a run of the route gives: a response it kept, or its own when it kept nothing. */
type Loaded = { kept: CachedResponse } | { own: Response };

/**
 * Responses kept and served again, as a plugin: a `GET` to a route declared
 * after it is answered from the store while fresh, and from the route
 * otherwise. Concurrent misses run the route once. Stale, it is served at
 * once and refreshed behind. A response that says `no-store` or `private`,
 * sets a cookie, or has another status is never kept.
 *
 * Every kept response gets a weak `ETag` from its body when it has none, so
 * a client whose copy is current gets a 304.
 *
 * ```ts
 * const products = cache({ ttl: 60, staleWhileRevalidate: 300, tags: () => ['products'] });
 * app.use(products).get('/products', ...);
 * await products.invalidateTag('products');
 * ```
 */
export function cache(options: CacheOptions) {
	const store = options.store ?? new MemoryCacheStore();
	const ttl = options.ttl * 1000;
	const stale = (options.staleWhileRevalidate ?? 0) * 1000;
	const vary = (options.vary ?? []).map((name) => name.toLowerCase());
	const statuses = new Set(options.statuses ?? [200]);
	const debug = options.debugHeaders ?? true;
	const keyOf =
		options.key ??
		((ctx: BaseContext) =>
			defaultKey(
				`${ctx.url.pathname}${ctx.url.search}`,
				vary,
				ctx.request.headers,
			));
	/** The run of each key being loaded: what it kept, or `undefined` when it kept nothing. */
	const loading = new Map<string, Promise<CachedResponse | undefined>>();
	const controls = new WeakMap<Request, { tags: string[]; skipped: boolean }>();
	/**
	 * A store that cannot answer is a miss, or keeps nothing: a cache is never
	 * worth a 500. Said to the log once per outage — again only after the
	 * store has answered since.
	 */
	let failing = false;
	const attempt = async <T>(
		work: () => Promise<T> | T,
		fallback: T,
	): Promise<T> => {
		try {
			const value = await work();
			failing = false;
			return value;
		} catch (error) {
			if (!failing) console.error(error);
			failing = true;
			return fallback;
		}
	};

	/**
	 * Runs the route once for every concurrent miss of a key, and keeps what
	 * it answers. Only a response that is kept is shared: one that is not —
	 * private, skipped, a cookie, another status — answers the request that
	 * ran the route, and every other waiting request runs the route itself.
	 */
	const load = (
		key: string,
		ctx: BaseContext,
		next: () => Promise<Response>,
	): Promise<CachedResponse | Response> => {
		const running = loading.get(key);
		if (running !== undefined) {
			return running.then(
				(cached): Promise<CachedResponse | Response> | CachedResponse =>
					cached ?? next(),
				(): Promise<CachedResponse | Response> => next(),
			);
		}
		const run = (async (): Promise<Loaded> => {
			const response = await next();
			const control = controls.get(ctx.request);
			if (
				control?.skipped ||
				!statuses.has(response.status) ||
				PRIVATE.test(response.headers.get('cache-control') ?? '') ||
				response.headers.has('set-cookie') ||
				response.headers.get('content-type')?.startsWith('text/event-stream')
			) {
				return { own: response };
			}
			const body = new Uint8Array(await response.arrayBuffer());
			const headers = new Headers(response.headers);
			headers.delete('content-length');
			headers.delete('date');
			if (!headers.has('etag')) {
				headers.set('etag', `W/"${Bun.hash(body).toString(36)}"`);
			}
			for (const name of vary) addVary(headers, name);
			const cached: CachedResponse = {
				status: response.status,
				headers: [...headers],
				body,
				storedAt: Date.now(),
				ttl,
				stale,
				tags: [
					...(options.tags?.(ctx) ?? []),
					...(control?.tags ?? []),
					pathTag(`${ctx.url.pathname}${ctx.url.search}`),
				],
			};
			await attempt(() => store.set(key, cached, ttl + stale), undefined);
			return { kept: cached };
		})();
		const shared = run.then((loaded) =>
			'kept' in loaded ? loaded.kept : undefined,
		);
		loading.set(key, shared);
		shared.finally(() => loading.delete(key)).catch(() => {});
		return run.then((loaded) => ('kept' in loaded ? loaded.kept : loaded.own));
	};

	const plugin = alxia()
		.derive(({ request }) => {
			const control = { tags: [] as string[], skipped: false };
			controls.set(request, control);
			const cacheControls: CacheControls = {
				tag: (...tags) => {
					control.tags.push(...tags);
				},
				skip: () => {
					control.skipped = true;
				},
			};
			return { cache: cacheControls };
		})
		.wrap(async (ctx, next) => {
			const { request } = ctx;
			if (request.method !== 'GET' && request.method !== 'HEAD') return next();
			if (
				options.honorClientNoCache &&
				/\bno-cache\b/i.test(request.headers.get('cache-control') ?? '')
			) {
				return next();
			}
			const key = keyOf(ctx);
			if (key === undefined) return next();

			const found = await attempt(() => store.get(key), undefined);
			const age =
				found === undefined
					? Number.POSITIVE_INFINITY
					: Date.now() - found.storedAt;
			if (found !== undefined && age < found.ttl) {
				return respond(request, found, debug ? 'HIT' : undefined);
			}
			if (found !== undefined && age < found.ttl + found.stale) {
				if (!loading.has(key)) {
					// Refreshed behind the response: the route's own error is its to log,
					// and a response it does not keep is read by no one.
					load(key, ctx, next)
						.then((loaded) =>
							loaded instanceof Response ? loaded.body?.cancel() : undefined,
						)
						.catch((error) => console.error(error));
				}
				return respond(request, found, debug ? 'STALE' : undefined);
			}
			const loaded = await load(key, ctx, next);
			if (loaded instanceof Response) return loaded;
			return respond(request, loaded, debug ? 'MISS' : undefined);
		});

	const handles: Cache = {
		store,
		invalidate: async (path) => {
			await store.deleteTag(pathTag(path));
		},
		invalidateTag: async (tag) => {
			await store.deleteTag(tag);
		},
	};
	return Object.assign(plugin, handles);
}
