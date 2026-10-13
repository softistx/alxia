# @alxia/i18n

Translations for [alxia](https://www.npmjs.com/package/@alxia/core), on
[`@nxgt/i18n`](https://www.npmjs.com/package/@nxgt/i18n): `t()` bound to the
request's language, keys typed by your catalogue, ICU messages — plurals,
selects, numbers.

```sh
bun add @alxia/i18n @alxia/language @nxgt/i18n@^3 @alxia/core
bun add -d typescript
```

## Usage

```ts
import { alxia } from '@alxia/core';
import { createI18n } from '@alxia/i18n';
import { resources as shared } from '@nxgt/i18n';

const en = { ...shared.en, cart: { items: '{count, plural, =0 {No items} one {One item} other {# items}}' } };
const fr = { ...shared.fr, cart: { items: '{count, plural, =0 {Aucun article} one {Un article} other {# articles}}' } };

export const i18n = createI18n({ resources: { en, fr }, fallback: 'en' });

const app = alxia()
	.use(i18n)
	.get('/cart', ({ t, reply }) => reply(200, t('cart.items', { count: 3 }))); // '3 articles' in French

app.listen(3000);
```

- **The language** is `@alxia/language`'s, among the catalogues' languages:
  the query, a cookie, `Accept-Language`, then `fallback`. Its options pass
  through: `createI18n({ resources, fallback, order: ['path', 'header'] })`.
- **Keys** are typed by the fallback's catalogue in the `resources` form, and by
  the type argument with an explicit `Key` (below): `t('cart.itmes')` is a
  compile error. A key a language lacks answers itself, unless you give it a [chain](#a-key-missing-in-the-requests-language).
- **`@nxgt/i18n`'s shared keys** — `errors.not-found`, `zod.*` — are yours by
  spreading its `resources` into your catalogues.

## A key missing in the request's language

Give `t()` more languages to try, so that a key a catalogue lacks answers
in the next one instead of answering itself:

```ts
import { alxia } from '@alxia/core';
import { createI18n } from '@alxia/i18n';

const en = { home: { title: 'Welcome', soon: 'Coming soon' } };
const fr = { home: { title: 'Bienvenue' } };
const pt = { home: { title: 'Bem-vindo' } };
const ptBR = {};

export const i18n = createI18n({
	resources: { en, fr, pt, 'pt-BR': ptBR },
	fallback: 'en',
	fallbacks: (language) => (language === 'pt-BR' ? ['pt'] : []), // pt-BR, then pt
});

alxia()
	.use(i18n)
	.derive(({ request }) => {
		// once the app knows more, for one request: the school's language
		i18n.fallBackTo(request.headers.get('x-tenant-language') ?? 'fr');
		return {};
	})
	.get('/', ({ t, reply }) => reply(200, [t('home.title'), t('home.soon'), i18n.chain()]));
// ?lang=pt-BR, x-tenant-language: fr → ['Bienvenue', 'Coming soon', ['pt-BR', 'fr', 'pt', 'en']]
```

`t(key)` tries `[language, ...fallBackTo steps, ...fallbacks(language),
fallback]`, each once, and answers the key only when all miss.
`i18n.chain()` is that list, for data the app labels itself. Without
`fallbacks` and `fallBackTo`, `t()` reads the request's language alone, as
before; once `fallbacks` is given, or `fallBackTo()` called, `fallback` joins its lookup.
The chain is walked by `@alxia/i18n` alone: `@nxgt/i18n` 3's own fallback
language (`getFallbackLanguage()`, `'en'` unless set) is never tried for `t()`,
so a key no language of the chain holds answers itself.

## Catalogues loaded at runtime

Name the keys with a type argument, and give the catalogues when you have
them; a request keeps the catalogues it started with:

```ts
import { createI18n } from '@alxia/i18n';

type Key = 'home.title' | 'cart.items';

export const i18n = createI18n<Key>({ fallback: 'en' });
// later, from a database or a file: all at once, `supported` follows
i18n.setResources({
	en: { home: { title: 'Welcome' }, cart: { items: '{count} items' } },
	fr: { home: { title: 'Bienvenue' }, cart: { items: '{count} articles' } },
});

i18n.supported; // ['en', 'fr']
i18n.t('home.title'); // 'Welcome'
i18n.t('home.titel'); // a compile error: not a Key
```

With a type argument, `Ctx` — what `resolve` reads — is no longer inferred:
name it third, `createI18n<Key, 'en' | 'fr', BaseContext & { user: User }>(…)`.
A `fallback` with no catalogue throws at start-up
([troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/i18n/docs/troubleshooting.md#typeerror-createi18n-there-is-no-catalogue-for-the-fallback-de)).

## Reading the app's context

Annotate `resolve`'s parameter to speak the language a signed-in user saved.
The middleware then requires what it reads: an app that does not give `user`
before it cannot use it.

```ts
import { alxia, type BaseContext } from '@alxia/core';
import { createI18n } from '@alxia/i18n';

const en = { home: { title: 'Welcome' } };
const fr = { home: { title: 'Bienvenue' } };

const auth = alxia().derive(({ request }) => ({
	user: request.headers.has('authorization') ? { language: 'fr' } : null, // your sign-in
}));

const byUser = createI18n({
	resources: { en, fr },
	fallback: 'en',
	order: ['query'],
	resolve: ({ user }: BaseContext & { user: { language: string } | null }) => user?.language,
});

alxia().plugin(auth).use(byUser); // auth derives user
alxia().use(byUser); // a compile error: this app gives no `user`
```

Unannotated, `resolve` reads the request alone and the middleware requires
nothing; annotated `any`, it is refused on every app.

## Anywhere

```ts
// a service, or an error's message: no language passed
export const describeCart = (count: number) => i18n.t('cart.items', { count });
```

`i18n.t()` translates in the language of the request it runs in — through
every `await`, in every middleware after `use(i18n)`, and in the answer to
an error — and in the fallback outside one, or before the language is
read: in a middleware declared before it, or a route declared before it
([troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/i18n/docs/troubleshooting.md#i18nt-answers-in-the-fallback-before-the-language-is-read)).
`i18n.language()` says which.

### `@nxgt/i18n`'s own `translate`

`createI18n()` registers the request's language as one of `@nxgt/i18n`'s
language sources: its `getLanguage()` and `translate` — and every nxgt
package that translates through them, an error's message — speak the alxia
request's language too.

## Cached responses

A response in the request's language varies by what decided it: give
`@alxia/cache` the same headers, `vary: ['accept-language', 'cookie']`.

## API

| export | |
| --- | --- |
| `createI18n({ resources, fallback, fallbacks?, …languageOptions })` | the middleware, given to `app.use` — what is after it reads `t` and `language` — with `t()`, `language()`, `supported`, `fallBackTo()`, `chain()` and `setResources()` |
| `createI18n<Key>({ languages?, fallback, resources?, … })` | the same with an explicit `Key` for the keys (and, third, `Ctx` when `resolve` reads the app's context), and catalogues that may come later, from `setResources()` |
| `i18n.fallBackTo(language)`, `i18n.chain()` | add a step to the current request's fallback chain; list the chain |
| `i18n.setResources(resources)` | swaps the catalogues at once; `supported` follows; a request running keeps its own |
| `I18nOptions`, `RuntimeI18nOptions` | its options: `resources`, `fallback`, `fallbacks`, and every `@alxia/language` option but `supported`; `resolve` may be annotated to read the app's context |
| `KeyOf<Catalogue>` | a catalogue's dotted keys, nine levels deep; a deeper section gives `section.${string}` |
| `Translate<Key>`, `Catalogues`, `I18nContext<Key>` | its types |
| `I18nMiddleware<Language, Key, Requires>` | what `createI18n()` returns: a middleware adding `language` and `t`, with `t()`, `language()`, `supported`, `fallBackTo()`, `chain()` and `setResources()` |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/i18n/docs): the catalogues and every option, reading what an earlier middleware added, what the routes read, ICU messages and typed keys, `t()` outside a route, and `@nxgt/i18n`'s own `translate`.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/i18n/docs/troubleshooting.md): an error, a key shown instead of a message, or a response in the wrong language, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/i18n/docs/roadmap.md): what is coming, and what is not planned.
