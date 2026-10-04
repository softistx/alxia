# Keys and Vary

This page covers what makes two requests "the same" to the cache: the
default key, `vary`, a `key` of your own, reading what an earlier middleware
added, and keeping personal responses out.

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

**The response's own `Vary` is not read.** Only the names in `vary` are in
the default key. A response that varies by a header of its own — `app.static` with
`precompressed` varies by `Accept-Encoding` — is kept once and served to
every client, whatever that header says. Name it here:
`vary: ['accept-encoding']` ([troubleshooting](../troubleshooting.md#a-client-that-sent-no-accept-encoding-gets-gzip-bytes)).

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
key?: (ctx: BaseContext & Requires) => string | undefined;
```

`key` replaces the default key whole. It is synchronous and reads the
`BaseContext` — `request`, `url`, `ip`, `server`, `route`, `pathParams` —
and `Requires`, empty by default. To key by what an earlier middleware added,
see [Reading the app's context](#reading-the-apps-context).

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

Whatever your key, [`invalidate(path)`](invalidation.md#by-path-invalidate)
still forgets every response kept for a path: it deletes by the path's tag,
not by key.

## Reading the app's context

To key or tag by what an earlier middleware added, such as a signed-in `user`
and its tenant, name it as `cache`'s type argument. `key` and `tags` then
read it, and the app that uses the cache must give it first: an app that
does not give `user` before it cannot use it.

```ts
const perTenant = cache<{ user: { tenantId: string } }>({
	ttl: 60,
	key: ({ user, url }) => `${user.tenantId}:${url.pathname}${url.search}`,
	tags: ({ user }) => [`tenant:${user.tenantId}`],
});

const auth = alxia().derive(({ request }) => ({
	user: { tenantId: request.headers.get('x-tenant') ?? 'public' }, // your session middleware
}));

const app = alxia()
	.use(auth)
	.use(perTenant)
	.get('/dashboard', ({ user, reply }) => reply(200, { tenant: user.tenantId }));

await perTenant.invalidateTag('tenant:acme'); // one tenant's pages, every path

alxia().use(perTenant);
// error: the plugin reads "user", which this app's context does not give: add the plugin or middleware that gives it first
```

The rule of [a key of your own](#a-key-of-your-own) still holds: the route
must choose by what the key reads, here the tenant, and nothing more
personal.

## Personal responses

The default key does not read who is asking. A route that answers by the
`Cookie` or `Authorization` header, behind a cache with the default key,
and says nothing about it, serves the first visitor's answer to every later
one. curl, sending no cookie, never shows it; a signed-in browser does.

A personal response that says so is never kept, nor shared with a
concurrent request: it answers `Cache-Control: private` (or `no-store`),
or sets a cookie. Three ways, from the cheapest:

```ts
// 1. Declare them before the cache: it never sees them, and no lookup is made.
alxia()
	.get('/me', ({ reply }) => reply(200, { name: 'Grace' }))
	.use(cache({ ttl: 60 }))
	.get('/products', ({ reply }) => reply(200, []));

// 2. No key for a request that carries a session: it is neither looked up nor kept.
cache({
	ttl: 60,
	key: ({ url, request }) =>
		request.headers.has('cookie') || request.headers.has('authorization')
			? undefined
			: `${url.pathname}${url.search}`,
});

// 3. Behind the cache, the route says its response is private: it is never kept.
app.get('/me', ({ reply }) =>
	reply(200, { name: 'Grace' }, { headers: { 'cache-control': 'private' } }),
);
```

The second skips the cache for **every** request with a cookie, which in a
browser is most of them once any cookie is set: prefer it for an API whose
callers sign every request. The third is enough on its own, and worth
sending anyway, for the browser and any proxy in front; the first also
saves the store lookup.

## See also

- [Caching responses](caching.md): which responses are kept at all.
- [Invalidation](invalidation.md): forgetting a key, or a tag.
