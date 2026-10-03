// An app behind the cache, behind exported functions whose return types are
// inferred: a declaration build must be able to name each one through
// `@alxia/cache` and `@alxia/core` alone (TS2883 otherwise).
import { cache, MemoryCacheStore } from '@alxia/cache';
import { alxia, type BaseContext } from '@alxia/core';

const responses = cache({
	ttl: 60,
	staleWhileRevalidate: 30,
	store: new MemoryCacheStore(),
	vary: ['accept-language'],
});

export function cached() {
	return alxia()
		.use(responses)
		.get('/products', ({ cache: controls, reply }) => {
			controls.tag('products');
			return reply(200, ['a']);
		});
}

export function cachedByUser() {
	return alxia()
		.derive(() => ({ user: { id: 'u' } }))
		.use(
			cache<{ user: { id: string } }>({
				ttl: 10,
				key: ({ user, url }) => `${user.id}:${url.pathname}`,
				tags: ({ user }) => [user.id],
			}),
		)
		.get('/me', ({ reply }) => reply(200, 'me'));
}

export function cachePlugin() {
	return responses;
}

export function cachedOn<Ctx extends BaseContext>(key: (ctx: Ctx) => string) {
	return cache<Ctx>({ ttl: 1, key });
}
