const caches = new WeakMap<object, Map<string, unknown>>();

/**
 * A value loaded at most once per request and key. `request` is any object
 * that lives as long as the request (the resolvers' context); the cache is
 * released with it. A `load` that throws, or returns a promise that rejects,
 * is not kept, so the next call tries again.
 */
export function oncePerRequest<T>(
	request: object,
	key: string,
	load: () => T,
): T {
	let cache = caches.get(request);
	if (!cache) {
		cache = new Map();
		caches.set(request, cache);
	}
	if (cache.has(key)) return cache.get(key) as T;
	const loaded = load();
	cache.set(key, loaded);
	if (loaded instanceof Promise) {
		const mine = cache;
		loaded.catch(() => {
			if (mine.get(key) === loaded) mine.delete(key);
		});
	}
	return loaded;
}
