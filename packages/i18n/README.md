# @alxia/i18n

Translations for [alxia](https://www.npmjs.com/package/@alxia/core), on
[`@nxgt/i18n`](https://www.npmjs.com/package/@nxgt/i18n): `t()` bound to the
request's language, keys typed by your catalogue, ICU messages — plurals,
selects, numbers.

```sh
bun add @alxia/i18n @alxia/language @nxgt/i18n@^2 @alxia/core
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
- **Keys** are typed by the fallback's catalogue: `t('cart.itmes')` is a
  compile error. A key a language lacks answers itself.
- **`@nxgt/i18n`'s shared keys** — `errors.not-found`, `zod.*` — are yours by
  spreading its `resources` into your catalogues.

## Reading the app's context

Annotate `resolve`'s parameter to speak the language a signed-in user saved.
The plugin then requires what it reads: an app that does not give `user`
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

alxia().use(auth).use(byUser); // auth derives user
alxia().use(byUser); // a compile error: this app gives no `user`
```

Unannotated, `resolve` reads the request alone and the plugin requires
nothing; annotated `any`, the plugin is refused on every app.

## Anywhere

```ts
// a service, or an error's message: no language passed
export const describeCart = (count: number) => i18n.t('cart.items', { count });
```

`i18n.t()` translates in the language of the request it runs in — through
every `await`, an `onError` hook included — and in the fallback outside
one, or before the language is read: in an `onRequest` hook, or a route
declared before the plugin
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
| `createI18n({ resources, fallback, …languageOptions })` | the plugin — routes after it read `t` and `language` — with `t()`, `language()` and `supported` |
| `I18nOptions` | its options: `resources`, `fallback`, and every `@alxia/language` option but `supported`; `resolve` may be annotated to read the app's context |
| `KeyOf<Catalogue>` | a catalogue's dotted keys, nine levels deep; a deeper section gives `section.${string}` |
| `Translate<Key>`, `Catalogues`, `I18nContext<Key>` | its types |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/i18n/docs): the catalogues and every option, reading what an earlier plugin added, what the routes read, ICU messages and typed keys, `t()` outside a route, and `@nxgt/i18n`'s own `translate`.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/i18n/docs/troubleshooting.md): an error, a key shown instead of a message, or a response in the wrong language, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/i18n/docs/roadmap.md): what is coming, and what is not planned.
