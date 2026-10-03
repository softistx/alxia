# Guide

This page covers how `language()` decides a request's language: each
option and its default, the sources it reads and in which order, how an
`Accept-Language` header is negotiated, what the routes behind it read, and
what it adds to the response.

```ts
import { alxia } from '@alxia/core';
import { language } from '@alxia/language';

const greetings = { en: 'Hello', fr: 'Bonjour', 'pt-BR': 'Olá' };

const app = alxia()
	.use(language({ supported: ['en', 'fr', 'pt-BR'], fallback: 'en' }))
	.get('/', ({ language: current, reply }) => reply(200, greetings[current]));

app.listen(3000);
```

A browser set to French gets `Bonjour`, one set to Brazilian Portuguese
gets `Olá`, `/?lang=fr` gets `Bonjour` whatever the browser says, and a
client that names no language it supports gets `Hello`. `current` is typed
`'en' | 'fr' | 'pt-BR'`, so `greetings[current]` needs no check.

## The signature

```ts
function language<const L extends string, Ctx extends object = BaseContext>(
	options: LanguageOptions<L, Ctx>,
): Alxia<RequiresOf<Ctx> & LanguageContext<L>, Empty, '', never> &
	Requiring<RequiresOf<Ctx>>;

interface LanguageOptions<L extends string, Ctx extends object = BaseContext> {
	readonly supported: readonly L[];
	readonly fallback: NoInfer<L>;
	readonly order?: readonly LanguageSource[];
	readonly query?: string;
	readonly cookie?: string;
	readonly pathIndex?: number;
	readonly persist?: boolean | { readonly maxAge?: number; readonly secure?: boolean };
	readonly contentLanguage?: boolean;
	readonly resolve?: (ctx: BaseContext & Ctx) => string | undefined;
	readonly vary?: readonly string[];
}

type LanguageSource = 'query' | 'cookie' | 'path' | 'header';
```

Both type parameters are inferred: `L` from `supported`, and `Ctx` from the
type `resolve`'s parameter is annotated with. `RequiresOf<Ctx>`,
`@alxia/core`'s, is what that annotation adds to `BaseContext` —
`{ user: User }` — and `Empty` when `resolve` is absent or not annotated;
see
[Reading the app's context](#reading-the-apps-context).

`language()` returns an app plugin: pass it to `use`, called. It is a
`derive`, so it applies to the routes declared **after** it — in the same
app, or inside the [group](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/groups-and-plugins.md)
it is used in — and adds `language` and `languageSource` to their context.
A route declared before it neither runs it nor reads them.

It throws once, when it is created, if `fallback` is not one of
`supported`:

```text
TypeError: language(): the fallback "de" is not supported
```

The types refuse that already when `supported` is a literal list; see
[Troubleshooting](troubleshooting.md#typeerror-language-the-fallback-de-is-not-supported)
for when they cannot.

## Options

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `supported` | `readonly L[]` | required | the languages the app speaks, and the type of `language` |
| `fallback` | `L` | required | the language when no source names a supported one |
| `order` | `readonly LanguageSource[]` | `['query', 'cookie', 'header']` | the sources read, in this order; a source not listed is never read |
| `query` | `string` | `'lang'` | the query parameter: `?lang=fr` |
| `cookie` | `string` | `'language'` | the cookie read, and written by `persist` |
| `pathIndex` | `number` | `0` | the path segment read by the `path` source: `/fr/products` is 0 |
| `persist` | `boolean \| { maxAge?, secure? }` | `false` | a language the query named is written to the cookie |
| `contentLanguage` | `boolean` | `true` | `Content-Language` on every response the plugin runs for |
| `resolve` | `(ctx: BaseContext & Ctx) => string \| undefined` | none | decides after every source, before `fallback`; its annotated parameter types what it reads |
| `vary` | `readonly string[]` | none | the request headers `resolve` reads, added to `Vary` |

### `supported` and `fallback`

`supported` is the list of languages, written as the tags your
translations use: `'en'`, `'pt-BR'`. Whatever a client sends, `language` is
one of these strings, spelled as you spelled it — `PT-br` from a client is
`'pt-BR'` on the context.

The type of `language` is read from the list, so write the list where
TypeScript can see its strings: inline, or `as const`. A list typed
`string[]` makes `language` a plain `string`:

```ts
export const supported = ['en', 'fr', 'pt-BR'] as const;
export type Language = (typeof supported)[number]; // 'en' | 'fr' | 'pt-BR'

language({ supported, fallback: 'en' });
```

`fallback` must be one of them; the types refuse another (`fallback: 'de'`
is a compile error), and so does the plugin, at start-up.

### `order`

The sources, read one after the other; the first that names a supported
language decides, and the others are not read.

```ts
language({ supported: ['en', 'fr'], fallback: 'en' });                            // query, cookie, header
language({ supported: ['en', 'fr'], fallback: 'en', order: ['path', 'header'] });  // /fr/… first, then the browser
language({ supported: ['en', 'fr'], fallback: 'en', order: ['header'] });          // the browser only
```

A value that names no supported language is skipped, not an error: with
`?lang=klingon` and `Accept-Language: fr`, the language is `fr`, from the
header. See [how the language is resolved](#how-the-language-is-resolved).

### `query` and `cookie`

The names of the query parameter and of the cookie:

```ts
language({ supported: ['en', 'fr'], fallback: 'en', query: 'locale', cookie: 'locale' });
// /?locale=fr, Cookie: locale=fr
```

### `pathIndex`

Which path segment the `path` source reads, counting from 0 and ignoring
empty segments. It is only read when `order` lists `'path'`:

```ts
language({ supported: ['en', 'fr'], fallback: 'en', order: ['path'], pathIndex: 1 });
// /shop/fr/products → 'fr'
```

The plugin reads the segment; it does not route on it or remove it. The
routes still declare it, as a parameter:

```ts
const app = alxia()
	.use(language({ supported: ['en', 'fr'], fallback: 'en', order: ['path', 'header'] }))
	.get('/:lang/products', ({ language: current, reply }) => reply(200, current));

await app.request('/fr/products'); // 'fr'
await app.request('/products');    // 404: no route matches; the plugin never runs
```

A segment is matched like any other tag, so `/fr-ca/products` is `fr` too.
A segment that names no supported language — `/de/products` — is skipped,
and the next source decides.

### `persist`

With `persist`, a language that came from the query is written to the
cookie, so a link to `?lang=fr` switches the next requests too:

```ts
language({ supported: ['en', 'fr'], fallback: 'en', persist: true });
// GET /?lang=fr → Set-Cookie: language=fr; Path=/; Max-Age=31536000; Secure; SameSite=Lax

language({ supported: ['en', 'fr'], fallback: 'en', persist: { maxAge: 3600, secure: false } });
// GET /?lang=fr → Set-Cookie: language=fr; Path=/; Max-Age=3600; SameSite=Lax
```

| `persist` field | Default | Effect |
| --- | --- | --- |
| `maxAge` | `31536000` (a year) | the cookie's lifetime, in seconds |
| `secure` | `true` | the `Secure` attribute: a browser drops the cookie over plain `http` |

The cookie is written with `Path=/` and `SameSite=Lax`, and without
`HttpOnly`, so a page's script can read the language too. It holds the
supported language the query matched — `?lang=fr-CA` writes `fr` — and is
only written when the query decided: a request whose language came from
the cookie or the header sets nothing. For the cookie to be read back,
`order` must list `'cookie'`, as the default does.

### `contentLanguage`

On by default: every response of a route behind the plugin says
`Content-Language: <language>`. A route that sets its own wins over it:

```ts
.get('/legal', ({ reply }) => reply(200, legalText, { headers: { 'content-language': 'fr' } }));
```

Turn it off for an app that sets it itself, or for responses that are not
in a language:

```ts
language({ supported: ['en', 'fr'], fallback: 'en', contentLanguage: false });
```

### `resolve`

A last word, after every source in `order` and before `fallback`: typically
a preference the user saved, read from what the request carries.

```ts
language({
	supported: ['en', 'fr'],
	fallback: 'en',
	order: ['query', 'cookie'],
	resolve: (ctx) => ctx.request.headers.get('x-preferred-language') ?? undefined,
	vary: ['X-Preferred-Language'],
});
```

`vary` names the request headers `resolve` reads, so a shared cache keeps
one response per value; the plugin cannot see what a function reads.

It receives the request's `BaseContext` — `request`, `url`, `ip`,
`pathParams`, `set` — and, when its parameter is annotated, what an earlier
plugin added: see [Reading the app's context](#reading-the-apps-context). It
returns a tag, or `undefined` for none. The tag is matched against
`supported` like any other: a tag it does not support is ignored, and
`fallback` decides. It is synchronous: a preference kept in a database is
either written to the cookie when the user saves it — see
[the realistic setup](#a-realistic-setup) — or loaded by an async `derive`
or plugin before `language()`, which `resolve` then reads — see
[Reading the app's context](#reading-the-apps-context).

### Reading the app's context

To decide by what an earlier plugin added, such as a signed-in `user` and
the language they saved, annotate `resolve`'s parameter. `language()` infers
what it reads from that annotation — `supported` still types `language` —
and the plugin is a
[`definePlugin`](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/writing-a-plugin.md#a-plugin-that-needs-an-earlier-one)
plugin: an app that does not give `user` before it cannot use it.

```ts
import { alxia, type BaseContext } from '@alxia/core';
import { language } from '@alxia/language';

interface User {
	readonly id: string;
	readonly language: string | null;
}

const byUser = language({
	supported: ['en', 'fr'],
	fallback: 'en',
	order: ['query', 'cookie'],
	resolve: ({ user }: BaseContext & { user: User | null }) => user?.language ?? undefined,
	vary: ['Authorization'], // what auth reads the user from
});

const app = alxia()
	.use(auth) // derives user: User | null
	.use(byUser)
	.get('/', ({ language: current, reply }) => reply(200, current)); // 'en' | 'fr'

alxia().use(byUser);
// error: the plugin reads "user", which this app's context does not give: use the plugin that adds it first
```

The annotation may be `BaseContext & { user: User }` or `{ user: User }`
alone; either way the plugin requires `{ user: User }`. An app whose `user`
has a type that does not fit it is refused too —
`the plugin reads "user", which this app's context gives with another type` —
while a narrower one passes: an app deriving `user: User` may use a plugin
that reads `User | null`. Annotating a key `BaseContext` already has with
a type it does not give — `({ url }: { url: string })` — is refused the
same way.
A `resolve` left unannotated reads `BaseContext` only, and the plugin
requires nothing.

`resolve` decides only when no source in `order` did. With `header` in
`order`, a browser that names a supported language decides before the
user's saved one: leave `header` out, as above, when the saved preference
should win over the browser's.

## How the language is resolved

For each request, in this order:

1. each source in `order`, one after the other — the first that names a
   supported language decides;
2. then `resolve(ctx)`, if given;
3. then `fallback`.

| Source | Reads | Example |
| --- | --- | --- |
| `query` | the `query` parameter | `?lang=fr` |
| `cookie` | the `cookie` cookie | `Cookie: language=fr` |
| `path` | the segment at `pathIndex` | `/fr/products` |
| `header` | `Accept-Language`, by weight | `Accept-Language: de, fr-CA;q=0.8` |

`languageSource` on the context says which one decided:

```ts
type LanguageSource = 'query' | 'cookie' | 'path' | 'header';
// on the context: LanguageSource | 'resolve' | 'fallback'
```

### Matching a tag

Every value — a query, a cookie, a path segment, each language of the
header, `resolve`'s answer — is matched against `supported` the same way,
by `match(tag, supported)`. The first rule that finds one wins:

| Rule | `supported` | Tag | Language |
| --- | --- | --- | --- |
| the tag itself, whatever its case | `['en', 'pt-BR']` | `PT-br` | `pt-BR` |
| its base language | `['en', 'fr']` | `fr-CA` | `fr` |
| a region of its base language | `['en', 'pt-BR']` | `pt`, or `pt-PT` | `pt-BR` |
| `*` | `['fr', 'en']` | `*` | `fr`: the first supported |
| none | `['en', 'fr']` | `de` | `undefined`: the next source decides |

```ts
import { match } from '@alxia/language';

match('EN-gb', ['en', 'fr']);    // 'en'
match('pt-PT', ['en', 'pt-BR']); // 'pt-BR'
match('de', ['en', 'fr']);       // undefined
```

When several regions of a language are supported, a base tag matches the
first of them: with `['en-US', 'en-GB']`, `en` is `en-US`.

### Negotiating `Accept-Language`

A browser sends every language its user configured, each with a weight
from 0 to 1. Chrome set to French, then English, sends:

```text
Accept-Language: fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7
```

`parseAcceptLanguage` reads it as a list, the most wanted first. A
language without `q` weighs 1; one with `q=0` (or a weight that is not a
number) is refused and dropped; equal weights keep the header's order:

```ts
import { parseAcceptLanguage } from '@alxia/language';

parseAcceptLanguage('fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7');
// [{ tag: 'fr-FR', q: 1 }, { tag: 'fr', q: 0.9 }, { tag: 'en-US', q: 0.8 }, { tag: 'en', q: 0.7 }]

parseAcceptLanguage('fr;q=0.5, en, de;q=0');
// [{ tag: 'en', q: 1 }, { tag: 'fr', q: 0.5 }]
```

`negotiate` walks that list and returns the first tag `match` finds a
supported language for — the user's most wanted language you speak, not
the closest match of the first one:

```ts
import { negotiate } from '@alxia/language';

negotiate('de, fr-CA;q=0.8, en;q=0.5', ['en', 'fr', 'pt-BR']);       // 'fr'
negotiate('de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7', ['en', 'fr']);     // 'en'
negotiate('de', ['en']);                                             // undefined
negotiate(null, ['en']);                                             // undefined
```

The second user reads German first, but English next: they get `en` with
`languageSource: 'header'`, not `'fallback'`.

`curl`, `fetch` on a server, and most HTTP clients send no
`Accept-Language` at all, so without a query or cookie they get
`fallback`. Send one to see what a browser gets:

```sh
curl -H 'Accept-Language: fr-FR,fr;q=0.9,en;q=0.8' http://localhost:3000/
```

```ts
type Accepted = { readonly tag: string; readonly q: number };

function parseAcceptLanguage(header: string | null | undefined): Accepted[];
function match<const L extends string>(tag: string, supported: readonly L[]): L | undefined;
function negotiate<const L extends string>(header: string | null | undefined, supported: readonly L[]): L | undefined;
```

The three are exported for code outside a request — a background job
choosing an email's language from a saved header, a WebSocket upgrade —
and return the same answers the plugin would.

## The typed context

The routes behind the plugin read:

```ts
interface LanguageContext<L extends string> {
	readonly language: L;
	readonly languageSource: LanguageSource | 'resolve' | 'fallback';
}
```

`language` is one of `supported`, never a string a client made up, so a
record keyed by the supported languages is indexed without a check, and a
missing translation is a compile error:

```ts
import { alxia } from '@alxia/core';
import { language } from '@alxia/language';

const supported = ['en', 'fr'] as const;
type Language = (typeof supported)[number];

const titles: Record<Language, string> = { en: 'Products', fr: 'Produits' };

const app = alxia()
	.use(language({ supported, fallback: 'en' }))
	.get('/products', ({ language: current, languageSource, reply }) =>
		reply(200, { title: titles[current], decidedBy: languageSource }),
	);
```

`LanguageContext<Language>` types a function that is given the context, or
part of it, outside the route:

```ts
import type { LanguageContext } from '@alxia/language';

const formatPrice = ({ language }: LanguageContext<Language>, cents: number) =>
	new Intl.NumberFormat(language, { style: 'currency', currency: 'EUR' }).format(cents / 100);
```

The destructured name `language` shadows the imported `language()` inside
the handler; rename it (`language: current`) where both are needed.

## What it adds to the response

| Header | When |
| --- | --- |
| `Content-Language: <language>` | unless `contentLanguage: false`; a route's own wins |
| `Vary: Accept-Language` | when `order` lists `'header'` |
| `Vary: Cookie` | when `order` lists `'cookie'` |
| `Vary: <each of vary>` | when `vary` names headers |
| `Set-Cookie: <cookie>=<language>; …` | with `persist`, when the query decided |

With the default `order`, every response says `Vary: Accept-Language, Cookie`,
so a shared cache keeps one copy per language rather than serving the first
one to everyone. The query and the path are part of the URL, and need no
`Vary`. What `resolve` reads is added only when the `vary` option names it.

The plugin adds to `ctx.set.headers`, and a reply's own `Vary` adds to it
rather than replacing it:

```ts
.get('/', ({ reply }) =>
	reply(200, 'ok', { headers: { vary: 'Accept-Encoding' } }),
); // Vary: Accept-Language, Cookie, Accept-Encoding
```

Behind [`@alxia/cache`](https://www.npmjs.com/package/@alxia/cache), give
the cache the same headers, so it keys by them:
`cache({ ttl: 60, vary: ['accept-language', 'cookie'] })`. A response that
sets a cookie — a `persist` from the query — is not cached.

A request that matches no route — a `404`, a `405` — never reaches the
plugin, so it carries none of these headers.

## A realistic setup

An app that speaks English, French and Brazilian Portuguese; a language
switcher made of `?lang=` links, remembered in a cookie; a route that saves
the user's choice; and a browser's languages for everyone else:

```ts
import { alxia } from '@alxia/core';
import { language, match } from '@alxia/language';

export const supported = ['en', 'fr', 'pt-BR'] as const;
export type Language = (typeof supported)[number];

const messages: Record<Language, { welcome: string }> = {
	en: { welcome: 'Welcome' },
	fr: { welcome: 'Bienvenue' },
	'pt-BR': { welcome: 'Bem-vindo' },
};

export const app = alxia()
	.use(
		language({
			supported,
			fallback: 'en',
			persist: { secure: process.env['NODE_ENV'] === 'production' },
		}),
	)
	.get('/', ({ language: current, reply }) => reply(200, messages[current].welcome))
	.put('/preferences/language/:lang', ({ params, set, reply }) => {
		const chosen = match(params.lang, supported);
		if (chosen === undefined) return reply(400, { error: 'unsupported_language' as const });
		set.cookies.set('language', chosen, { path: '/', sameSite: 'lax', maxAge: 365 * 24 * 60 * 60 });
		return reply(200, { language: chosen });
	});

export type App = typeof app;
```

The saved choice is the `language` cookie, which the plugin reads on every
request after, before the browser's languages. `secure` is off outside
production, so the cookie survives a plain-`http` development server.

And its tests, without a server:

```ts
import { describe, expect, test } from 'bun:test';
import { app } from './app';

describe('language', () => {
	test('a browser gets its most wanted language', async () => {
		const response = await app.request('/', {
			headers: { 'accept-language': 'de-DE,de;q=0.9,fr;q=0.8,en;q=0.7' },
		});
		expect(await response.text()).toBe('Bienvenue');
		expect(response.headers.get('content-language')).toBe('fr');
		expect(response.headers.get('vary')).toBe('Accept-Language, Cookie');
	});

	test('a client with no Accept-Language gets the fallback', async () => {
		expect(await (await app.request('/')).text()).toBe('Welcome');
	});

	test('a ?lang= link is kept in the cookie', async () => {
		const response = await app.request('/?lang=pt');
		expect(await response.text()).toBe('Bem-vindo');
		expect(response.headers.getSetCookie()[0]).toContain('language=pt-BR');
	});

	test('the cookie wins over the browser', async () => {
		const response = await app.request('/', {
			headers: { cookie: 'language=fr', 'accept-language': 'en' },
		});
		expect(await response.text()).toBe('Bienvenue');
	});

	test('a saved choice is refused when unsupported', async () => {
		const response = await app.request('/preferences/language/de', { method: 'PUT' });
		expect(response.status).toBe(400);
	});
});
```

[`@alxia/i18n`](https://www.npmjs.com/package/@alxia/i18n) builds on this
plugin — its options pass through — and adds `t()` bound to the request's
language. When something does not behave as described here,
[Troubleshooting](troubleshooting.md) starts from the symptom.
