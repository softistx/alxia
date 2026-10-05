# Guide

This page covers `createI18n()`: the catalogues and the fallback, the
`@alxia/language` options it passes through, what the routes behind it
read, how messages are formatted and keys typed, where its own `t()` knows
the request's language and where it does not, and how `@nxgt/i18n`'s
`translate` follows it.

```ts
import { alxia } from '@alxia/core';
import { createI18n } from '@alxia/i18n';

const en = { home: { title: 'Welcome', greeting: 'Hello {name}' } };
const fr = { home: { title: 'Bienvenue', greeting: 'Bonjour {name}' } };

const i18n = createI18n({ resources: { en, fr }, fallback: 'en' });

const app = alxia()
	.use(i18n)
	.get('/', ({ t, reply }) => reply(200, { title: t('home.title'), greeting: t('home.greeting', { name: 'Ada' }) }));

app.listen(3000);
```

A browser set to French gets `{"title":"Bienvenue","greeting":"Bonjour Ada"}`,
`/?lang=en` gets English whatever the browser says, and a client that names
no language the catalogues have gets the fallback's, English.
`t('home.titel')` does not compile.

## The signature

```ts
function createI18n<
	const C extends Catalogues,
	const Fallback extends keyof C & string,
	Ctx extends object = BaseContext,
>(
	options: I18nOptions<C, Fallback, Ctx>,
): Middleware<RequiresOf<Ctx, 'resolve'>, Promise<Next<LanguageContext<keyof C & string> & I18nContext<KeyOf<C[Fallback]>>>>> & {
	t: Translate<KeyOf<C[Fallback]>>;
	language: () => keyof C & string;
	supported: (keyof C & string)[];
};

interface I18nOptions<C extends Catalogues, Fallback extends keyof C & string, Ctx extends object = BaseContext>
	extends Omit<LanguageOptions<keyof C & string, Ctx>, 'supported' | 'fallback'> {
	readonly resources: C;
	readonly fallback: Fallback;
}

type Catalogues = Readonly<Record<string, Readonly<Record<string, unknown>>>>;
type KeyOf<Catalogue> = …; // every key, dotted: 'home.title', nine levels deep
type Translate<Key extends string> = (key: Key, context?: TranslationContext) => string;
interface I18nContext<Key extends string> {
	readonly t: Translate<Key>;
}
```

`C` and `Fallback` are inferred from `resources` and `fallback`, and `Ctx`
from the type `resolve`'s parameter is annotated with: `RequiresOf<Ctx, 'resolve'>`,
`@alxia/core`'s, is what that annotation adds to `BaseContext`, and `Empty`
when `resolve` is absent or not annotated. See
[Reading the app's context](#reading-the-apps-context).

`createI18n()` returns two things in one value:

- **a middleware**: pass it to `app.use`. It runs on every request the app
  takes, and applies to what is declared **after** it, in the same app or
  [group](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/groups-and-plugins.md):
  the middlewares and the routes. It adds `t`, `language` and `languageSource`
  to their context;
- **`t()`, `language()` and `supported`**, to call where no context is at
  hand: a service, a model, a job. See [Outside a route](#outside-a-route).

It also registers the request's language with `@nxgt/i18n` — one source,
however many times `createI18n()` is called, so building an app per test
does not grow `@nxgt/i18n`'s list; see [`@nxgt/i18n`'s own `translate`](#nxgti18ns-own-translate).

## Options

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `resources` | `Catalogues` | required | one catalogue per language; its keys are the languages the app supports |
| `fallback` | one of `resources`' keys | required | the language when no source names a supported one, and the catalogue whose keys type `t` |
| `order` | `readonly LanguageSource[]` | `['query', 'cookie', 'header']` | the sources read, in this order |
| `query` | `string` | `'lang'` | the query parameter: `?lang=fr` |
| `cookie` | `string` | `'language'` | the cookie read, and written by `persist` |
| `pathIndex` | `number` | `0` | the path segment the `path` source reads |
| `persist` | `boolean \| { maxAge?, secure? }` | `false` | a language the query named is kept in the cookie |
| `contentLanguage` | `boolean` | `true` | `Content-Language` on every response the middleware runs for |
| `resolve` | `(ctx: BaseContext & Ctx) => string \| undefined` | none | decides after every source, before `fallback`; annotate `ctx` to read what an earlier middleware adds |

Every option but `resources` and `fallback` is `@alxia/language`'s, passed
through as it is; its [guide](https://github.com/softistx/alxia/blob/develop/packages/language/docs/guide.md)
details each one, how `Accept-Language` is negotiated, and the `Vary` the
middleware adds. `supported` is not an option here: it is `resources`' keys.

### `resources`

One catalogue per language, nested as deep as you like. A leaf is an
[ICU message](#messages); a key is its dotted path, `cart.items`:

```ts
import { createI18n } from '@alxia/i18n';

const en = {
	cart: {
		items: '{count, plural, =0 {No items} one {One item} other {# items}}',
		total: 'Total: {amount, number, ::currency/EUR}',
	},
};
const fr = {
	cart: {
		items: '{count, plural, =0 {Aucun article} one {Un article} other {# articles}}',
		total: 'Total : {amount, number, ::currency/EUR}',
	},
};

export const i18n = createI18n({ resources: { en, fr }, fallback: 'en' });
```

Catalogues kept in JSON files work as they are, typed keys included, with
`resolveJsonModule` in your `tsconfig.json`:

```ts
import { createI18n } from '@alxia/i18n';
import en from './locales/en.json';
import fr from './locales/fr.json';

export const i18n = createI18n({ resources: { en, fr }, fallback: 'en' });
```

`@nxgt/i18n` ships catalogues of its own, in English and French: error
messages (`errors.not-found`, `errors.unauthenticated`, …), validation
messages, and `zod.*`. Spread its `resources` into yours to translate them
with the same `t`:

```ts
import { createI18n } from '@alxia/i18n';
import { resources as shared } from '@nxgt/i18n';

const en = { ...shared.en, home: { title: 'Welcome' } };
const fr = { ...shared.fr, home: { title: 'Bienvenue' } };

export const i18n = createI18n({ resources: { en, fr }, fallback: 'en' });

i18n.t('errors.not-found'); // 'Could not find the requested resource.'
```

### `fallback`

The language of every request that names none the catalogues have, of
`i18n.t()` outside a request — and the catalogue that types the keys. It
must be one of `resources`' keys; anything else is a compile error:

```text
error TS2322: Type '"de"' is not assignable to type '"en" | "fr"'.
```

and, when a cast hides it from the compiler, an error when `createI18n()`
is called:

```text
TypeError: language(): the fallback "de" is not supported
```

### The language options

To read the language from the path rather than the query:

```ts
import { alxia } from '@alxia/core';
import { createI18n } from '@alxia/i18n';

const i18n = createI18n({
	resources: { en: { home: { title: 'Welcome' } }, fr: { home: { title: 'Bienvenue' } } },
	fallback: 'en',
	order: ['path', 'header'],
});

export const app = alxia()
	.use(i18n)
	.get('/:lang/home', ({ t, reply }) => reply(200, t('home.title'))); // /fr/home → 'Bienvenue'
```

The middleware reads the segment; it does not route on it, so the routes
declare it.

### Reading the app's context

To speak the language a signed-in user saved, annotate `resolve`'s
parameter with what an earlier middleware added. `createI18n()` infers it from
the annotation — the languages and the keys are still inferred from
`resources` and `fallback` — and the middleware then requires it: an app that
does not give `user` before it cannot use it.

```ts
import { alxia, type BaseContext } from '@alxia/core';
import { createI18n } from '@alxia/i18n';

interface User {
	readonly language: string | null;
}

const i18n = createI18n({
	resources: { en, fr },
	fallback: 'en',
	order: ['query'], // the query decides first, then the user's saved language
	resolve: ({ user }: BaseContext & { user: User | null }) => user?.language ?? undefined,
});

export const app = alxia()
	.plugin(auth) // an app: derives user: User | null
	.use(i18n)
	.get('/', ({ t, reply }) => reply(200, t('home.title')));

alxia().use(i18n);
// error: Property 'user' is missing in type 'BaseContext & Empty' but required in type '{ user: User | null; }'
```

This is `@alxia/language`'s check, carried through; its
[guide](https://github.com/softistx/alxia/blob/develop/packages/language/docs/guide.md#reading-the-apps-context)
details it. A `resolve` left unannotated reads `BaseContext` only, and the
middleware requires nothing. Annotated `any`, it is refused on every
app:
[`the plugin's resolve reads its context as any: annotate what it reads, or leave it unannotated`](troubleshooting.md#the-plugins-resolve-reads-its-context-as-any-annotate-what-it-reads-or-leave-it-unannotated).

## What the routes read

| Property | Type | Is |
| --- | --- | --- |
| `t` | `Translate<KeyOf<C[Fallback]>>` | translates into the request's language |
| `language` | `keyof C & string` | the request's language: `'en' \| 'fr'` |
| `languageSource` | `LanguageSource \| 'resolve' \| 'fallback'` | what decided it, from `@alxia/language` |

```ts
import { alxia } from '@alxia/core';
import { createI18n } from '@alxia/i18n';

const i18n = createI18n({
	resources: { en: { home: { title: 'Welcome' } }, fr: { home: { title: 'Bienvenue' } } },
	fallback: 'en',
});

export const app = alxia()
	.use(i18n)
	.get('/', ({ t, language, languageSource, reply }) =>
		reply(200, { title: t('home.title'), language, languageSource }),
	);
// GET /?lang=fr → {"title":"Bienvenue","language":"fr","languageSource":"query"}
```

They are in the context of every route, and of every `derive`, declared
after `.use(i18n)`. A standalone middleware (`defineMiddleware`) does not
know the app it is used on: it calls `i18n.t()`, which follows the request
([Outside a route](#outside-a-route)). A route declared before `.use(i18n)`
reads none of them:

```text
error TS2339: Property 't' does not exist on type 'Context<Empty, "/", Empty>'.
```

## Messages

Messages are ICU, formatted by `@nxgt/i18n` with `intl-messageformat` in
the request's language. The second argument of `t` holds the values:

```ts
import { createI18n } from '@alxia/i18n';

const en = {
	greeting: 'Hello {name}',
	items: '{count, plural, =0 {No items} one {One item} other {# items}}',
	role: '{role, select, admin {an administrator} other {a member}}',
	total: 'Total: {amount, number, ::currency/EUR}',
};
const i18n = createI18n({ resources: { en }, fallback: 'en' });

i18n.t('greeting', { name: 'Ada' }); // 'Hello Ada'
i18n.t('items', { count: 3 }); // '3 items'
i18n.t('role', { role: 'admin' }); // 'an administrator'
i18n.t('total', { amount: 12.5 }); // 'Total: €12.50'
```

What `t` answers when it cannot do better — it never throws:

| Case | Answer |
| --- | --- |
| the key is in the request's catalogue | the message, formatted |
| the request's catalogue lacks the key | **the key itself**, `'home.title'` — not the fallback's message |
| a value the message names is missing, or the message is not valid ICU | the message unformatted, `'Hello {name}'`, and the error logged with `console.error` |

The values are not typed by the message: `t('greeting')` compiles, and
answers `'Hello {name}'` with this line in the log:

```text
The intl string context variable "name" was not provided to the string "Hello {name}"
```

A language whose catalogue is partial shows keys, not the fallback's
messages. Fill it from the fallback before passing it — a nested merge, as
a spread only replaces whole branches:

```ts
import { createI18n } from '@alxia/i18n';

type Tree = { readonly [key: string]: unknown };

const fill = (from: Tree, into: Tree): Tree =>
	Object.fromEntries(
		Object.entries(from).map(([key, value]) => {
			const own = into[key];
			return [
				key,
				typeof value === 'object' && value !== null && typeof own === 'object' && own !== null
					? fill(value as Tree, own as Tree)
					: (own ?? value),
			];
		}),
	);

const en = { home: { title: 'Welcome', subtitle: 'Good to see you' } };
const de = { home: { title: 'Willkommen' } }; // no subtitle yet

export const i18n = createI18n({ resources: { en, de: fill(en, de) }, fallback: 'en' });
// in German: t('home.subtitle') → 'Good to see you', not 'home.subtitle'
```

## Typed keys

`t` takes the dotted keys of the **fallback's** catalogue, and nothing
else:

```ts
import { createI18n } from '@alxia/i18n';

const en = { cart: { items: '{count, plural, one {One item} other {# items}}' } };
const fr = { cart: { items: '{count, plural, one {Un article} other {# articles}}', extra: 'Rien' } };

const i18n = createI18n({ resources: { en, fr }, fallback: 'en' });

i18n.t('cart.items', { count: 2 });
// @ts-expect-error: a typo
i18n.t('cart.itmes');
// @ts-expect-error: only in French
i18n.t('cart.extra');
```

```text
error TS2345: Argument of type '"cart.itmes"' is not assignable to parameter of type '"cart.items"'.
```

The keys are read from the catalogue's type. A catalogue typed
`Record<string, …>` — built at runtime, or annotated so — has no keys to
read, and `t` then takes any string. Declare catalogues as literals, or
import them from JSON.

To type a function that receives `t`, or a key it is given, name the types
from the catalogue:

```ts
import { createI18n, type KeyOf, type Translate } from '@alxia/i18n';

const en = { cart: { items: '{count, plural, one {One item} other {# items}}' } };
export const i18n = createI18n({ resources: { en }, fallback: 'en' });

type Key = KeyOf<typeof en>; // 'cart.items'

export const describeCart = (t: Translate<Key>, count: number) => t('cart.items', { count });
```

`KeyOf` gives the keys of `@nxgt/i18n`'s `Path`, nine levels deep; a section
nested deeper gives `section.${string}`, any key under it. The bound is what
lets a function generic over its catalogues hand them to `createI18n`:

```ts
import { alxia } from '@alxia/core';
import { type Catalogues, createI18n } from '@alxia/i18n';

export function translatedWith<const C extends Catalogues, const Fallback extends keyof C & string>(
	resources: C,
	fallback: Fallback,
) {
	return alxia()
		.use(createI18n({ resources, fallback }))
		.get('/', ({ language, reply }) => reply(200, language));
}
```

## Outside a route

`i18n.t()` translates in the language of the request it runs in, and
`i18n.language()` says which; outside a request, both are the fallback's.
Nothing is passed down: the request's language follows every `await` and
every function the route calls, an event stream's generator included.

```ts
import { alxia } from '@alxia/core';
import { createI18n } from '@alxia/i18n';

const i18n = createI18n({
	resources: {
		en: { cart: { items: '{count, plural, one {One item} other {# items}}' } },
		fr: { cart: { items: '{count, plural, one {Un article} other {# articles}}' } },
	},
	fallback: 'en',
});

// a service, deep down: no language passed
async function describeCart(count: number) {
	await Bun.sleep(1);
	return i18n.t('cart.items', { count });
}

export const app = alxia()
	.use(i18n)
	.get('/cart', async ({ reply }) => reply(200, await describeCart(3))); // ?lang=fr → '3 articles'

i18n.language(); // 'en': no request here
```

The middleware reads the request's language, then runs the rest of the
chain inside it: everything after it knows the language, through every
`await`, and so does the answer to an error, since `i18n` settles `next()`.
Before it, `i18n.t()` and `i18n.language()` answer in the fallback:

| Where | `i18n.t()` answers in |
| --- | --- |
| a middleware, `derive` or route declared after `.use(i18n)`, before and after its `next()`, and what they call | the request's language |
| a middleware after it that catches an error | the request's language |
| a middleware after it, on a `404` or a `405` no route matched | the request's language |
| a middleware declared before `.use(i18n)`, in and out | the fallback: the language is not read yet |
| a route declared before `.use(i18n)` | the fallback: the middleware does not run for it |
| code outside any request: start-up, a timer, a queue consumer | the fallback: pass the language, see below |

An error-handling middleware translates an error's message with `i18n.t()`.
Declare it after `.use(i18n)` (and after the observers, `logger()` and
`telemetry()`):

```ts
import { alxia, defineMiddleware, HttpError } from '@alxia/core';
import { createI18n } from '@alxia/i18n';
import { resources as shared } from '@nxgt/i18n';

const i18n = createI18n({ resources: { en: shared.en, fr: shared.fr }, fallback: 'en' });

export const app = alxia()
	.use(i18n)
	.use(
		defineMiddleware(async ({ reply }, next) => {
			try {
				return await next();
			} catch (error) {
				if (error instanceof HttpError && error.status === 404)
					return reply(404, { error: i18n.t('errors.not-found') });
				throw error;
			}
		}),
	)
	.get('/users/:id', () => {
		throw new HttpError(404, {});
	});
// GET /users/1?lang=fr → 404 {"error":"Impossible de trouver la ressource demandée."}
```

Outside any request, a job that knows its user's language uses
`@nxgt/i18n`'s `createTranslator` on the same catalogues, with that
language:

```ts
import { createI18n, type KeyOf } from '@alxia/i18n';
import { createTranslator } from '@nxgt/i18n';

const en = { mail: { subject: 'Your order {id}' } };
const fr = { mail: { subject: 'Votre commande {id}' } };
const resources = { en, fr };

export const i18n = createI18n({ resources, fallback: 'en' });

const translator = createTranslator<KeyOf<typeof en>>(resources);
translator('mail.subject', { id: 42 }, 'fr'); // 'Votre commande 42'
```

`createTranslator`'s third argument is typed with `@nxgt/i18n`'s own
languages, `'en' | 'fr'`.

## `@nxgt/i18n`'s own `translate`

`createI18n()` registers the request's language as a language source of
`@nxgt/i18n`. Its `getLanguage()` and `translate` — and every package that
translates through them — answer in the alxia request's language, wherever
`i18n.t()` would:

```ts
import { alxia } from '@alxia/core';
import { createI18n } from '@alxia/i18n';
import { getLanguage, translate, resources as shared } from '@nxgt/i18n';

const i18n = createI18n({ resources: { en: shared.en, fr: shared.fr }, fallback: 'en' });

export const app = alxia()
	.use(i18n)
	.get('/', ({ reply }) => reply(200, { language: getLanguage(), message: translate('errors.not-found') }));
// GET /?lang=fr → {"language":"fr","message":"Impossible de trouver la ressource demandée."}
```

Its limits are `@nxgt/i18n`'s:

- **It speaks `en` and `fr` only.** A request in a language your
  catalogues add — `de` — is not one of them, and `getLanguage()` answers
  as if no source had: `'en'`.
- **Its fallback is `'en'`, not yours.** Outside a request, or before the
  language is read, `getLanguage()` answers `'en'` even when your
  `fallback` is `'fr'`.
- **It hears one middleware.** With two `createI18n()` on one app, it follows
  the language the first one read — its fallback included, when the
  request named a language only the second supports.

## Caching

A response in the request's language varies by what decided it. The
middleware says so in `Vary` — `Accept-Language, Cookie` with the default `order` —
and a cache in front of it needs the same headers:

```ts
import { alxia } from '@alxia/core';
import { cache } from '@alxia/cache';
import { createI18n } from '@alxia/i18n';

const i18n = createI18n({
	resources: { en: { home: { title: 'Welcome' } }, fr: { home: { title: 'Bienvenue' } } },
	fallback: 'en',
});

export const app = alxia()
	.use(i18n)
	.use(cache({ ttl: 60, vary: ['accept-language', 'cookie'] }))
	.get('/', ({ t, reply }) => reply(200, t('home.title')));
```

## Testing

`app.request()` takes the header a browser sends, or the query:

```ts
import { expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { createI18n } from '@alxia/i18n';

const i18n = createI18n({
	resources: { en: { home: { title: 'Welcome' } }, fr: { home: { title: 'Bienvenue' } } },
	fallback: 'en',
});
const app = alxia()
	.use(i18n)
	.get('/', ({ t, reply }) => reply(200, t('home.title')));

test("answers in the browser's language", async () => {
	const response = await app.request('/', { headers: { 'accept-language': 'fr-FR,fr;q=0.9' } });
	expect(await response.text()).toBe('Bienvenue');
	expect(response.headers.get('content-language')).toBe('fr');
});

test('answers in the fallback when nothing names a language', async () => {
	expect(await (await app.request('/')).text()).toBe('Welcome');
});
```

## A realistic setup

Catalogues in JSON, `@nxgt/i18n`'s shared messages spread in, a service
that translates without being passed a language, errors rendered in the
request's language, and a language switcher that sticks:

```ts
// src/i18n.ts
import { createI18n } from '@alxia/i18n';
import { resources as shared } from '@nxgt/i18n';
import ownEn from './locales/en.json';
import ownFr from './locales/fr.json';

export const i18n = createI18n({
	resources: { en: { ...shared.en, ...ownEn }, fr: { ...shared.fr, ...ownFr } },
	fallback: 'en',
	persist: { secure: process.env['NODE_ENV'] === 'production' },
});
```

```ts
// src/app.ts
import { alxia, defineMiddleware, HttpError } from '@alxia/core';
import { i18n } from './i18n';

const carts = new Map<string, string[]>([['c1', ['book', 'pen']]]);

// a service: no language passed
const describeCart = (items: readonly string[]) => i18n.t('cart.items', { count: items.length });

export const app = alxia()
	.use(i18n)
	.use(
		defineMiddleware(async ({ reply }, next) => {
			try {
				return await next();
			} catch (error) {
				if (error instanceof HttpError && error.status === 404)
					return reply(404, { error: i18n.t('errors.not-found') });
				throw error;
			}
		}),
	)
	.get('/carts/:id', ({ params, reply }) => {
		const items = carts.get(params.id);
		if (items === undefined) throw new HttpError(404, {});
		return reply(200, { items, summary: describeCart(items) });
	});

app.listen(3000);
```

With `locales/en.json` holding
`{ "cart": { "items": "{count, plural, =0 {No items} one {One item} other {# items}}" } }`,
`/carts/c1?lang=fr` answers `{"items":["book","pen"],"summary":"2 articles"}`
and sets the `language` cookie, so `/carts/c2` — without the query —
answers `404 {"error":"Impossible de trouver la ressource demandée."}`.

When something does not answer in the language you expected, see
[Troubleshooting](troubleshooting.md).
