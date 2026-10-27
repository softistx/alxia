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

/**
 * Forgets what `oncePerRequest` kept for this request, so the next call for
 * any key loads again. A call to `oncePerRequest` already in flight keeps its
 * own value; only later calls see the empty cache.
 */
export function clearRequestCache(request: object): void {
	caches.delete(request);
}

/**
 * A mutation's root fields run one after the other in one request, and one
 * may change what a later one reads. `freshPerMutation(resolvers)` returns
 * the resolvers with every function of `Mutation` wrapped to call
 * `clearRequestCache(context)` before it runs: each root mutation field starts
 * with an empty cache, its own sub-fields share it, and a query (no wrapped
 * field) keeps one cache for the whole request. Other types are untouched.
 */
export function freshPerMutation<R extends object>(resolvers: R): R {
	const mutation = (resolvers as { Mutation?: unknown }).Mutation as
		| Record<string, unknown>
		| undefined;
	if (!mutation) return resolvers;
	const wrapped: Record<string, unknown> = {};
	for (const [name, field] of Object.entries(mutation)) {
		if (typeof field !== 'function') {
			wrapped[name] = field;
			continue;
		}
		wrapped[name] = function (
			this: unknown,
			parent: unknown,
			args: unknown,
			context: unknown,
			info: unknown,
		) {
			if (typeof context === 'object' && context !== null) {
				clearRequestCache(context);
			}
			return field.call(this, parent, args, context, info);
		};
	}
	return { ...resolvers, Mutation: wrapped };
}
