# Troubleshooting

Each entry is headed by the text you see: the error `language()` throws at
start-up, an error from `tsc`, or — for a trap that prints nothing — what
the response does that you did not expect.

**At start-up**

- [`TypeError: language(): the fallback "de" is not supported`](#typeerror-language-the-fallback-de-is-not-supported)

**Types**

- [`Type '"de"' is not assignable to type '"en" | "fr"'`](#type-de-is-not-assignable-to-type-en--fr)
- [`Property 'language' does not exist on type 'Context<Empty, "/", Empty>'`](#property-language-does-not-exist-on-type-contextempty--empty)
- [`Type 'Alxia<Empty, "", never>' is missing the following properties from type 'LanguageOptions<string, BaseContext>': supported, fallback`](#type-alxiaempty--never-is-missing-the-following-properties-from-type-languageoptionsstring-basecontext-supported-fallback)
- [`Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ en: string; fr: string; }'`](#element-implicitly-has-an-any-type-because-expression-of-type-string-cant-be-used-to-index-type--en-string-fr-string-)
- [`Type 'string | null' is not assignable to type 'string | undefined'`](#type-string--null-is-not-assignable-to-type-string--undefined)
- [`Type 'Promise<string>' is not assignable to type 'string'`](#type-promisestring-is-not-assignable-to-type-string)
- [`Property 'user' does not exist on type 'BaseContext'`](#property-user-does-not-exist-on-type-basecontext)
- [`the plugin reads "user", which this app's context does not give: add the plugin or middleware that gives it first`](#the-plugin-reads-user-which-this-apps-context-does-not-give-add-the-plugin-or-middleware-that-gives-it-first)
- [`the plugin reads "user", which this app's context gives with another type`](#the-plugin-reads-user-which-this-apps-context-gives-with-another-type)
- [`the plugin's resolve reads its context as any: annotate what it reads, or leave it unannotated`](#the-plugins-resolve-reads-its-context-as-any-annotate-what-it-reads-or-leave-it-unannotated)

**Responses**

- [The browser gets French, `curl` gets English](#the-browser-gets-french-curl-gets-english)
- [`?lang=fr` works, but the next page is back in the browser's language](#langfr-works-but-the-next-page-is-back-in-the-browsers-language)
- [A cache serves one language to every visitor](#a-cache-serves-one-language-to-every-visitor)
- [`404 {"error":"not_found"}` on `/fr/products`](#404-errornot_found-on-frproducts)
- [`Accept-Language: *` gets the first supported language, not the fallback](#accept-language--gets-the-first-supported-language-not-the-fallback)
- [A visitor from Portugal gets `pt-BR`](#a-visitor-from-portugal-gets-pt-br)

## At start-up

### `TypeError: language(): the fallback "de" is not supported`

**When:** `language()` is called — when the module that builds the app is
imported, before it serves anything — with a `fallback` that is not in
`supported`.

**Why:** the fallback is the language of every request that names none
the app speaks, so it must be one of them. The types refuse it when they
can see the strings; they cannot when `supported` is typed `string[]` — a
list built at runtime, read from configuration, or declared without
`as const` — or when `fallback` comes from the environment through a cast.

**Fix:** list the fallback among the supported languages, and keep the
list literal so the compiler checks it next time:

```ts
const supported = ['en', 'fr', 'de'] as const;

language({ supported, fallback: 'de' });
```

## Types

### `Type '"de"' is not assignable to type '"en" | "fr"'`

```text
error TS2322: Type '"de"' is not assignable to type '"en" | "fr"'.
```

**When:** `language({ supported: ['en', 'fr'], fallback: 'de' })`.

**Why:** `fallback` is typed as one of `supported`. This is the compile-time
form of [the start-up error](#typeerror-language-the-fallback-de-is-not-supported).

**Fix:** a fallback the app supports:

```ts
language({ supported: ['en', 'fr'], fallback: 'en' });
```

### `Property 'language' does not exist on type 'Context<Empty, "/", Empty>'`

```text
error TS2339: Property 'language' does not exist on type 'Context<Empty, "/", Empty>'.
```

**When:** a route reads `language` but is declared before
`.use(language(…))`, or in another app or group than the one that mounts it.

**Why:** the middleware applies to what is declared after it, at runtime
and in the types alike. A route before it never runs it.

**Fix:** `use` it first:

```ts
const app = alxia()
	.use(language({ supported: ['en', 'fr'], fallback: 'en' }))
	.get('/', ({ language: current, reply }) => reply(200, current));
```

### `Type 'Alxia<Empty, "", never>' is missing the following properties from type 'LanguageOptions<string, BaseContext>': supported, fallback`

```text
error TS2769: No overload matches this call.
  Overload 1 of 11, '(plugin: (app: Alxia<Empty, "", never>) => AnyAlxia): AnyAlxia', gave the following error.
    Argument of type '<const L extends string, Ctx extends object = BaseContext>(options: LanguageOptions<L, Ctx>) => Middleware<…>' is not assignable to parameter of type '(app: Alxia<Empty, "", never>) => AnyAlxia'.
      Types of parameters 'options' and 'app' are incompatible.
        Type 'Alxia<Empty, "", never>' is missing the following properties from type 'LanguageOptions<string, BaseContext>': supported, fallback
```

**When:** `app.use(language)`, without calling it.

**Why:** `language` makes the middleware from its options; it is not the
middleware.

**Fix:**

```ts
alxia().use(language({ supported: ['en', 'fr'], fallback: 'en' }));
```

### `Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ en: string; fr: string; }'`

```text
error TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ en: string; fr: string; }'.
  No index signature with a parameter of type 'string' was found on type '{ en: string; fr: string; }'.
```

**When:** a route indexes a record with `language`, and `supported` was
declared apart from the call without `as const`:

```ts
const langs = ['en', 'fr'];                      // string[]
alxia()
	.use(language({ supported: langs, fallback: 'en' }))
	.get('/', ({ language: current, reply }) => reply(200, greetings[current]));
```

**Why:** `language` is typed from the strings of `supported`. A list typed
`string[]` has none, so `language` is a plain `string` — and the fallback
is not checked either.

**Fix:** declare the list `as const`, and derive its type from it:

```ts
const supported = ['en', 'fr'] as const;
type Language = (typeof supported)[number];       // 'en' | 'fr'

const greetings: Record<Language, string> = { en: 'Hello', fr: 'Bonjour' };

alxia()
	.use(language({ supported, fallback: 'en' }))
	.get('/', ({ language: current, reply }) => reply(200, greetings[current]));
```

### `Type 'string | null' is not assignable to type 'string | undefined'`

```text
error TS2322: Type '(ctx: BaseContext) => string | null' is not assignable to type '(ctx: BaseContext) => string | undefined'.
  Type 'string | null' is not assignable to type 'string | undefined'.
```

**When:** `resolve` returns a header or a search parameter as it is:
`resolve: (ctx) => ctx.request.headers.get('x-preferred-language')`.

**Why:** `Headers.get` and `URLSearchParams.get` return `null` for a
missing value; `resolve` says "none" with `undefined`.

**Fix:**

```ts
language({
	supported: ['en', 'fr'],
	fallback: 'en',
	resolve: (ctx) => ctx.request.headers.get('x-preferred-language') ?? undefined,
});
```

### `Type 'Promise<string>' is not assignable to type 'string'`

```text
error TS2322: Type '() => Promise<string>' is not assignable to type '(ctx: BaseContext) => string | undefined'.
  Type 'Promise<string>' is not assignable to type 'string'.
```

**When:** `resolve` is `async` — it looks a user's saved preference up in a
database or a session store.

**Why:** `resolve` is synchronous: it runs on every request, after the
sources, and returns a tag or `undefined`.

**Fix:** keep the preference where the middleware already reads it. When the
user saves it, write it to the cookie; every request after reads it from
there, before `Accept-Language`:

```ts
const supported = ['en', 'fr'] as const;

const app = alxia()
	.use(language({ supported, fallback: 'en' }))
	.put('/preferences/language/:lang', ({ params, set, reply }) => {
		const chosen = match(params.lang, supported);
		if (chosen === undefined) return reply(400, { error: 'unsupported_language' as const });
		set.cookies.set('language', chosen, { path: '/', sameSite: 'lax', maxAge: 365 * 24 * 60 * 60 });
		return reply(200, { language: chosen });
	});
```

Do the same at sign-in, from the stored preference.

Or load it before the middleware, in an async `derive` or the middleware that
signs the user in, and annotate `resolve` to read it — see
[Reading the app's context](guide.md#reading-the-apps-context):

```ts
const app = alxia()
	.derive(async ({ request }) => ({ saved: await preferences.find(request) }))
	.use(
		language({
			supported,
			fallback: 'en',
			resolve: ({ saved }: { saved: string | undefined }) => saved,
		}),
	);
```

### `Property 'user' does not exist on type 'BaseContext'`

```text
error TS2339: Property 'user' does not exist on type 'BaseContext'.
```

**When:** `resolve` reads something a `derive` or a middleware before
`language()` added — a user, a session — and its parameter is not
annotated: `resolve: (ctx) => ctx.user.language`.

**Why:** an unannotated `resolve` is typed with the request's `BaseContext`
— `request`, `url`, `ip`, `pathParams`, `set` — not with what other middlewares
added. `language()` is built before it is used, so it cannot see the app it
will be used on.

**Fix:** annotate the parameter with what it reads. `language()` infers it
from the annotation, and the app that uses the middleware must then give it,
before it:

```ts
import type { BaseContext } from '@alxia/core';

const byUser = language({
	supported: ['en', 'fr'],
	fallback: 'en',
	resolve: ({ user }: BaseContext & { user: User }) => user.language ?? undefined,
});

alxia().plugin(auth).use(byUser); // auth derives user
```

See [Reading the app's context](guide.md#reading-the-apps-context).

### `the plugin reads "user", which this app's context does not give: add the plugin or middleware that gives it first`

```text
error TS2769: No overload matches this call.
  …
        Types of property ''~requires'' are incompatible.
          Type '{ user: User; }' is not assignable to type '"the plugin reads \"user\", which this app's context does not give: add the plugin or middleware that gives it first"'.
```

**When:** the middleware's `resolve` is annotated to read `user`, and it is
used on an app — or in a group — whose context has no `user` at that point:
`alxia().use(byUser)`, or `use(byUser)` before `plugin(auth)`.

**Why:** an annotated `resolve` makes the middleware require what it reads, and
`app.use` checks the app's context against it, so `resolve` never runs without
it.

**Fix:** mount what adds `user` first, with the type `resolve`
reads:

```ts
alxia().plugin(auth).use(byUser);
```

More on this message in
[`@alxia/core`'s troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/core/docs/troubleshooting.md#the-plugin-reads--which-this-apps-context-does-not-give-add-the-plugin-or-middleware-that-gives-it-first).

### `the plugin reads "user", which this app's context gives with another type`

```text
error TS2769: No overload matches this call.
  …
          Type '{ user: User; }' is not assignable to type '"the plugin reads \"user\", which this app's context gives with another type"'.
```

**When:** the app gives a `user`, but of a type that does not fit the one
`resolve`'s parameter is annotated with: a `User | null` where `resolve`
reads `User`, or a user of another shape.

**Why:** `app.use` checks each key the middleware reads against the app's context;
a narrower type passes, a wider or different one does not.

**Fix:** annotate `resolve` with the type the app gives — `User | null`,
handled inside — or narrow it in the middleware before:

```ts
language({
	supported: ['en', 'fr'],
	fallback: 'en',
	resolve: ({ user }: { user: User | null }) => user?.language ?? undefined,
});
```

More on this message in
[`@alxia/core`'s troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/core/docs/troubleshooting.md#the-plugin-reads--which-this-apps-context-gives-with-another-type).

### `the plugin's resolve reads its context as any: annotate what it reads, or leave it unannotated`

```text
error TS2769: No overload matches this call.
  …
        Types of property ''~requires'' are incompatible.
          Type '{ readonly '~any': "the plugin's resolve reads its context as any: annotate what it reads, or leave it unannotated"; }' is not assignable to type '"the plugin's resolve reads its context as any: annotate what it reads, or leave it unannotated"'.
```

**When:** `resolve`'s parameter is annotated `any` —
`resolve: (ctx: any) => ctx.user.language` — and the middleware is used, on
any app, whatever its context gives.

**Why:** an `any` parameter reads any key and says nothing of what it
reads, so the middleware would require nothing, and an app without a `user`
would be accepted, and throw on every request. It is refused
instead.

**Fix:** annotate what `resolve` reads, and mount what adds it
first:

```ts
const byUser = language({
	supported: ['en', 'fr'],
	fallback: 'en',
	resolve: ({ user }: BaseContext & { user: User }) => user.language ?? undefined,
});

alxia().plugin(auth).use(byUser);
```

Or leave it unannotated when it reads only the request:
`resolve: (ctx) => ctx.request.headers.get('x-preferred-language') ?? undefined`.

More on this message in
[`@alxia/core`'s troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/core/docs/troubleshooting.md#the-plugins--reads-its-context-as-any-annotate-what-it-reads-or-leave-it-unannotated).

## Responses

### The browser gets French, `curl` gets English

**When:** a page opened in a browser is in the user's language, while the
same URL fetched with `curl`, a server-side `fetch`, or a test is in the
fallback, with `languageSource: 'fallback'`.

**Why:** a browser sends `Accept-Language` with every request —
`fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7` — and `curl` and most HTTP clients
send none. With no query and no cookie either, nothing names a language,
and `fallback` decides.

**Fix:** send the header a browser sends, or name the language:

```sh
curl -H 'Accept-Language: fr-FR,fr;q=0.9,en;q=0.8' http://localhost:3000/
curl 'http://localhost:3000/?lang=fr'
```

```ts
await app.request('/', { headers: { 'accept-language': 'fr-FR,fr;q=0.9,en;q=0.8' } });
```

### `?lang=fr` works, but the next page is back in the browser's language

**When:** a language switcher links to `?lang=fr`; that page is in French,
the next one, without the query, is not.

**Why:** the query only decides the request that carries it. The middleware
keeps it for the next ones only when all of these hold:

- `persist` is set — it is off by default;
- `order` lists `'cookie'` — the cookie is written, but never read back
  with `order: ['query', 'header']`;
- the browser keeps the cookie. It is `Secure` by default, and a browser
  drops a `Secure` cookie set over plain `http` — on a LAN address or a
  development hostname, and on `localhost` too in some browsers, Safari
  among them.

**Fix:**

```ts
language({
	supported: ['en', 'fr'],
	fallback: 'en',
	order: ['query', 'cookie', 'header'],
	persist: { secure: process.env['NODE_ENV'] === 'production' },
});
```

### A cache serves one language to every visitor

**When:** behind a CDN, a reverse proxy, or `@alxia/cache`, the first
visitor's language is served to everyone after.

**Why:** the response depends on what the middleware read, and a cache keyed
on the URL alone ignores it. It says `Vary: Accept-Language,
Cookie` with the default `order`, and a reply's own `Vary` adds to it. Two
things still leave a header out:

- what `resolve` reads, unless the `vary` option names it;
- a middleware (or a deprecated `onResponse` hook) that sets `Vary` with
  `headers.set` instead of `@alxia/core`'s `vary`, which replaces every
  name before it.

**Fix:** name what `resolve` reads, add to `Vary` rather than setting it,
and give a cache the same headers:

```ts
import { alxia, vary, withHeaders } from '@alxia/core';

alxia()
	.use(
		language({
			supported: ['en', 'fr'],
			fallback: 'en',
			resolve: (ctx) => ctx.request.headers.get('x-preferred-language') ?? undefined,
			vary: ['X-Preferred-Language'],
		}),
	)
	.onResponse((response) => withHeaders(response, (headers) => vary(headers, 'Accept-Encoding')));
// Vary: Accept-Language, Cookie, X-Preferred-Language, Accept-Encoding
```

```ts
cache({ ttl: 60, vary: ['accept-language', 'cookie', 'x-preferred-language'] }); // @alxia/cache
```

### `404 {"error":"not_found"}` on `/fr/products`

**When:** `order` lists `'path'`, and the routes are declared without the
language segment: `.get('/products', …)`.

**Why:** the middleware reads the segment at `pathIndex`; it does not remove
it from the path or route on it. `/fr/products` matches no route, so the
`404` is answered: the language was read, but no route answers in it.

**Fix:** declare the segment in the routes:

```ts
alxia()
	.use(language({ supported: ['en', 'fr'], fallback: 'en', order: ['path', 'header'] }))
	.get('/:lang/products', ({ language: current, reply }) => reply(200, current));
```

### `Accept-Language: *` gets the first supported language, not the fallback

**When:** a client sends `Accept-Language: *`, and `supported` does not
start with `fallback`: `supported: ['fr', 'en'], fallback: 'en'` answers
`fr`, with `languageSource: 'header'`.

**Why:** `*` accepts any language, so it matches one — the first of
`supported`. `fallback` is only for a request that names none.

**Fix:** list the language a wildcard should get first, usually the
fallback:

```ts
language({ supported: ['en', 'fr'], fallback: 'en' });
```

### A visitor from Portugal gets `pt-BR`

**When:** `supported` holds `'pt-BR'` and no other Portuguese, and the
browser sends `pt-PT` or `pt`.

**Why:** a tag the app does not support exactly falls back to its base
language, then to a region of it: `pt-PT` is `pt-BR`, as `fr-CA` is `fr`.
That is usually what you want; when it is not, support the region.

**Fix:** list both regions — an exact tag always wins, and `pt` alone gets
the first one listed:

```ts
language({ supported: ['en', 'pt-PT', 'pt-BR'], fallback: 'en' });
```
