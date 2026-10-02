# Keys and Vary

This page covers what makes two requests "the same" to the cache: the
default key, `vary`, a `key` of your own, and keeping personal responses
out.

```ts
import { alxia } from '@alxia/core';
import { cache } from '@alxia/cache';

const app = alxia()
	.use(cache({ ttl: 60, vary: ['accept-language'] }))
	.get('/hello', ({ request, reply }) =>
		reply(200, request.headers.get('accept-language')?.startsWith('fr') ? 'Bonjour' : 'Hello'),
	);

// GET /hello with accept-language: fr → "Bonjour", kept under "/hello|accept-language=fr"
// GET /hello with accept-language: en → "Hello",   kept under "/hello|accept-language=en"
```

## The default key

The request's path and query, as they arrive — prefix included — then the
value of each `vary` header:

```ts
defaultKey(path: string, vary: readonly string[], headers: Headers): string
```

```ts
import { defaultKey } from '@alxia/cache';

defaultKey('/api/products?page=2', [], new Headers());
// '/api/products?page=2'

defaultKey('/hello', ['accept-language'], new Headers({ 'accept-language': 'fr' }));
// '/hello|accept-language=fr'

defaultKey('/hello', ['accept-language'], new Headers());
// '/hello|accept-language='   — a missing header is its own key
```

The query is taken as written: `?a=1&b=2` and `?b=2&a=1` are two keys, and
two misses. Nothing else of the request is in the key — no cookie, no
`Authorization` — unless it is in `vary`, or in a `key` of your own.

## `vary`

```ts
cache({ ttl: 60, vary: ['accept-language'] });
```

Each header named is:

- part of the default key, by its exact value;
- appended to the response's `Vary`, so a browser or a CDN in front keys
  its own copy the same way.

Names are matched case-insensitively and written lowercased.

**Exact value means exact.** A browser sends its whole preference list —
`Accept-Language: fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7` — and two visitors
whose lists differ by one entry are two keys, though your route answers
both in French. curl sends no `Accept-Language` at all, so every curl
request shares the one key `…|accept-language=`: a test with curl shows hits
that real traffic will not. When the route reduces a header to a few
values, key by those values instead — [below](#a-key-of-your-own).

`vary: ['cookie']` is rarely what you want: a browser sends every cookie of
the site, analytics included, so almost every visitor has a key of their
own and the cache keeps one copy per visitor. Keep personal responses
[out of the cache](#personal-responses) instead.

## A key of your own

```ts
key?: (ctx: BaseContext) => string | undefined;
```

`key` replaces the default key whole. It is synchronous and reads the
`BaseContext` — `request`, `url`, `ip`, `server`, `route`, `pathParams` —
not what another plugin added to the context.

Keyed by the language the route actually answers in, two visitors who both
prefer French share one copy:

```ts
import { alxia } from '@alxia/core';
import { cache } from '@alxia/cache';

const supported = ['en', 'fr', 'de'] as const;

function language(header: string | null): string {
	const first = (header ?? '').split(',')[0]?.split('-')[0]?.trim().toLowerCase() ?? '';
	return (supported as readonly string[]).includes(first) ? first : 'en';
}

const app = alxia()
	.use(
		cache({
			ttl: 60,
			vary: ['accept-language'],                   // still says `Vary: accept-language`
			key: ({ url, request }) =>
				`${url.pathname}${url.search}|${language(request.headers.get('accept-language'))}`,
		}),
	)
	.get('/hello', ({ request, reply }) =>
		reply(200, language(request.headers.get('accept-language')) === 'fr' ? 'Bonjour' : 'Hello'),
	);
```

Two rules keep a custom key honest:

- **The route must choose by what the key reads.** Here both call the same
  `language()`. A route that reads more than the key would be kept under
  one key with two different bodies, and serve whichever came first.
- **`vary` no longer feeds the key** once `key` is set: it only writes
  `Vary`. Use `defaultKey` inside your key to keep both:

```ts
import { cache, defaultKey } from '@alxia/cache';

cache({
	ttl: 60,
	vary: ['accept-language'],
	key: ({ url, request }) =>
		request.headers.has('authorization')
			? undefined
			: defaultKey(`${url.pathname}${url.search}`, ['accept-language'], request.headers),
});
```

A custom key also changes what
[`invalidate(path)`](invalidation.md#by-path-invalidate) can reach: it
deletes the default key of a path, which your key may not be.

## Personal responses

The default key does not read who is asking. A route that answers by the
`Cookie` or `Authorization` header, behind a cache with the default key,
serves the first visitor's answer to every later one. curl, sending no
cookie, never shows it; a signed-in browser does.

Two ways keep them out, the first one being the way to choose:

```ts
// 1. Declare them before the cache: it never sees them.
alxia()
	.get('/me', ({ reply }) => reply(200, { name: 'Grace' }))
	.use(cache({ ttl: 60 }))
	.get('/products', ({ reply }) => reply(200, []));

// 2. No key for a request that carries a session: it is neither looked up, nor kept, nor shared.
cache({
	ttl: 60,
	key: ({ url, request }) =>
		request.headers.has('cookie') || request.headers.has('authorization')
			? undefined
			: `${url.pathname}${url.search}`,
});
```

The second skips the cache for **every** request with a cookie, which in a
browser is most of them once any cookie is set. Prefer it for an API whose
callers sign every request, and the first for everything else.

**`Cache-Control: private` is not enough.** A route behind the cache that
answers `private` (or calls `cache.skip()`, or sets a cookie) is not kept,
but concurrent requests for its URL still wait on one run of the route,
built from one of them. One visitor gets that response, perhaps someone
else's, and the others fail with a 500
([Not kept is not the same as not shared](caching.md#not-kept-is-not-the-same-as-not-shared)).
Say `private` anyway, for the browser and any proxy in front, but keep the
route out of the cache by declaring it first.

## See also

- [Caching responses](caching.md): which responses are kept at all.
- [Invalidation](invalidation.md): forgetting a key, or a tag.
