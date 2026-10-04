# Troubleshooting

Each entry is headed by the text you see: the error `createI18n()` throws,
an error from `tsc`, a line in the log, or — for a trap that prints
nothing — what the response does that you did not expect.

**At start-up**

- [`TypeError: language(): the fallback "de" is not supported`](#typeerror-language-the-fallback-de-is-not-supported)

**Types**

- [`Type '"de"' is not assignable to type '"en" | "fr"'`](#type-de-is-not-assignable-to-type-en--fr)
- [`Argument of type '"cart.itmes"' is not assignable to parameter of type '"cart.items"'`](#argument-of-type-cartitmes-is-not-assignable-to-parameter-of-type-cartitems)
- [`Property 't' does not exist on type 'Context<Empty, "/", Empty>'`](#property-t-does-not-exist-on-type-contextempty--empty)
- [`Type 'BaseContext & Empty' is missing the following properties from type 'I18nOptions<Readonly<Record<string, Readonly<Record<string, unknown>>>>, string, BaseContext>': resources, fallback`](#type-basecontext--empty-is-missing-the-following-properties-from-type-i18noptionsreadonlyrecordstring-readonlyrecordstring-unknown-string-basecontext-resources-fallback)
- [`Object literal may only specify known properties, and 'supported' does not exist in type 'I18nOptions<…>'`](#object-literal-may-only-specify-known-properties-and-supported-does-not-exist-in-type-i18noptions)
- [`Cannot invoke an object which is possibly 'undefined'`](#cannot-invoke-an-object-which-is-possibly-undefined)
- [`t()` accepts any key, typos included](#t-accepts-any-key-typos-included)
- [`Property 'user' does not exist on type 'BaseContext'`](#property-user-does-not-exist-on-type-basecontext)
- [`Property 'user' is missing in type 'BaseContext & Empty' but required in type '{ user: User | null; }'`](#property-user-is-missing-in-type-basecontext--empty-but-required-in-type--user-user--null-)
- [`Types of property 'user' are incompatible`](#types-of-property-user-are-incompatible)
- [`the plugin's resolve reads its context as any: annotate what it reads, or leave it unannotated`](#the-plugins-resolve-reads-its-context-as-any-annotate-what-it-reads-or-leave-it-unannotated)

**Messages**

- [`The intl string context variable "name" was not provided to the string "Hello {name}"`](#the-intl-string-context-variable-name-was-not-provided-to-the-string-hello-name)
- [`SyntaxError: MISSING_OTHER_CLAUSE`](#syntaxerror-missing_other_clause)
- [The page shows `home.title` instead of a message](#the-page-shows-hometitle-instead-of-a-message)

**Language**

- [`i18n.t()` answers in the fallback before the language is read](#i18nt-answers-in-the-fallback-before-the-language-is-read)
- [`@nxgt/i18n`'s `translate` answers in English on a German request](#nxgti18ns-translate-answers-in-english-on-a-german-request)
- [`getLanguage()` answers `en` although the fallback is `fr`](#getlanguage-answers-en-although-the-fallback-is-fr)
- [A cache serves one language to every visitor](#a-cache-serves-one-language-to-every-visitor)

## At start-up

### `TypeError: language(): the fallback "de" is not supported`

**When:** `createI18n()` is called — when the module that builds it is
imported — with a `fallback` that is not one of `resources`' keys.

**Why:** the fallback is the language of every request that names none the
catalogues have, so it needs a catalogue. The types refuse it when they can
see the keys of `resources`; they cannot when `fallback` comes from the
environment through a cast, or `resources` is typed `Record<string, …>`.
The message is `@alxia/language`'s, which `createI18n()` calls.

**Fix:** give the fallback a catalogue, and keep `resources` a literal so
the compiler checks it next time:

```ts
import { createI18n } from '@alxia/i18n';

const en = { home: { title: 'Welcome' } };
const de = { home: { title: 'Willkommen' } };

createI18n({ resources: { en, de }, fallback: 'de' });
```

## Types

### `Type '"de"' is not assignable to type '"en" | "fr"'`

```text
error TS2322: Type '"de"' is not assignable to type '"en" | "fr"'.
```

**When:** `createI18n({ resources: { en, fr }, fallback: 'de' })`.

**Why:** `fallback` is typed as one of `resources`' keys. This is the
compile-time form of [the start-up error](#typeerror-language-the-fallback-de-is-not-supported).

**Fix:** a fallback with a catalogue:

```ts
createI18n({ resources: { en, fr }, fallback: 'en' });
```

### `Type instantiation is excessively deep and possibly infinite`

```text
error TS2589: Type instantiation is excessively deep and possibly infinite.
```

**When:** a function generic over its catalogues hands them to
`createI18n`, then uses the plugin, with `@alxia/i18n` 0.1.1 or earlier:

```ts
function translatedWith<const C extends Catalogues, const Fallback extends keyof C & string>(
	resources: C,
	fallback: Fallback,
) {
	return alxia().use(createI18n({ resources, fallback }));
}
```

**Why:** `KeyOf` was `@nxgt/i18n`'s `Path`, which recurses without a bound.
With `C` a type parameter, the keys stay deferred, and some checks then
unfold them forever. A tsconfig whose `types` leaves out `bun` is one
setting that triggers them.

**Fix:** upgrade `@alxia/i18n`: `KeyOf` now reads nine levels deep at most.

### `Argument of type '"cart.itmes"' is not assignable to parameter of type '"cart.items"'`

```text
error TS2345: Argument of type '"cart.itmes"' is not assignable to parameter of type '"cart.items"'.
```

**When:** `t('cart.itmes')` — a typo — or `t('cart.extra')`, a key that
only another language's catalogue has.

**Why:** `t` takes the dotted keys of the **fallback's** catalogue, and no
other. A key the fallback lacks would answer itself in the fallback's
language.

**Fix:** correct the key, or add it to the fallback's catalogue first:

```ts
const en = { cart: { items: '{count, plural, one {One item} other {# items}}', extra: 'Nothing' } };
const fr = { cart: { items: '{count, plural, one {Un article} other {# articles}}', extra: 'Rien' } };

const i18n = createI18n({ resources: { en, fr }, fallback: 'en' });
i18n.t('cart.extra');
```

### `Property 't' does not exist on type 'Context<Empty, "/", Empty>'`

```text
error TS2339: Property 't' does not exist on type 'Context<Empty, "/", Empty>'.
```

**When:** a route reads `t` — or `language` — but is declared before
`.use(i18n)`, or in another app or group than the one that mounts it.

**Why:** the middleware applies to what is declared after it, at runtime
and in the types alike.

**Fix:** `use` it first:

```ts
const app = alxia()
	.use(i18n)
	.get('/', ({ t, reply }) => reply(200, t('home.title')));
```

### `Type 'BaseContext & Empty' is missing the following properties from type 'I18nOptions<Readonly<Record<string, Readonly<Record<string, unknown>>>>, string, BaseContext>': resources, fallback`

```text
error TS2769: No overload matches this call.
  The last overload gave the following error.
    Argument of type '<const C extends Catalogues, const Fallback extends keyof C & string, Ctx extends object = BaseContext>(options: I18nOptions<C, Fallback, Ctx>) => I18nMiddleware<keyof C & string, KeyOf<C[Fallback]>, RequiresOf<...>>' is not assignable to parameter of type 'ScopeMiddleware<Empty, [], MiddlewareReturn>'.
      …
        Types of parameters 'options' and 'ctx' are incompatible.
          Type 'BaseContext & Empty' is missing the following properties from type 'I18nOptions<Readonly<Record<string, Readonly<Record<string, unknown>>>>, string, BaseContext>': resources, fallback
```

TypeScript 7 prints the last overload alone, as above; TypeScript 6 lists the deprecated plugin forms of `use` first, then this one as `Overload 3 of 11`.

**When:** `app.use(createI18n)`, without calling it.

**Why:** `createI18n` makes the middleware from its options; it is not the
middleware.

**Fix:** call it once, in a module of its own, and use what it returns:

```ts
export const i18n = createI18n({ resources: { en, fr }, fallback: 'en' });

const app = alxia().use(i18n);
```

### `Object literal may only specify known properties, and 'supported' does not exist in type 'I18nOptions<…>'`

```text
error TS2353: Object literal may only specify known properties, and 'supported' does not exist in type 'I18nOptions<{ readonly en: { cart: { items: string; }; }; readonly fr: { cart: { items: string; extra: string; }; }; }, "en", BaseContext>'.
```

**When:** `createI18n({ resources, fallback: 'en', supported: ['en'] })`,
the way `@alxia/language` is called.

**Why:** the languages supported are `resources`' keys; `createI18n()`
passes them to `@alxia/language` itself. Through a cast, `supported` is
ignored.

**Fix:** leave it out. To support fewer languages, pass fewer catalogues:

```ts
createI18n({ resources: { en }, fallback: 'en' });
```

### `Cannot invoke an object which is possibly 'undefined'`

```text
error TS2722: Cannot invoke an object which is possibly 'undefined'.
```

**When:** a deprecated `onError` hook calls `t('…')` from its context. (A
middleware declared after `.use(i18n)` has no such doubt: `t` is typed there.)

**Why:** `onError` also handles what was thrown before the middleware ran —
by a middleware declared before it — so what it adds is optional there.

**Fix:** in an error-handling middleware declared after `.use(i18n)`, catch
around `next()` and call `t`, or the middleware's own `i18n.t()`, which always
answers, in the request's language and in the fallback when the error was
thrown before the language was read:

```ts
import { alxia, defineMiddleware, HttpError } from '@alxia/core';

alxia()
	.use(i18n)
	.use(
		defineMiddleware(async ({ t, reply }, next) => {
			try {
				return await next();
			} catch (error) {
				if (error instanceof HttpError && error.status === 404) {
					return reply(404, { error: t('errors.not-found') });
				}
				throw error;
			}
		}),
	);
```

### `t()` accepts any key, typos included

**When:** the catalogues are built at runtime, read with
`await Bun.file(…).json()`, or annotated
`Record<string, Record<string, string>>`.

**Why:** the keys are read from the fallback catalogue's type. A catalogue
typed `Record<string, …>` has none to read, so `t` takes any string — and
a wrong one [answers itself](#the-page-shows-hometitle-instead-of-a-message).

**Fix:** declare the catalogues as literals, or import them from JSON
files, which keeps their keys in the type (`resolveJsonModule` in your
`tsconfig.json`):

```ts
import en from './locales/en.json';
import fr from './locales/fr.json';

export const i18n = createI18n({ resources: { en, fr }, fallback: 'en' });
```

### `Property 'user' does not exist on type 'BaseContext'`

```text
error TS2339: Property 'user' does not exist on type 'BaseContext'.
```

**When:** `resolve` reads something a `derive` or a middleware before the
i18n middleware added — a user, a session — and its parameter is not
annotated: `resolve: (ctx) => ctx.user.language`.

**Why:** an unannotated `resolve` is typed with the request's `BaseContext`
— `request`, `url`, `ip`, `pathParams`, `set` — not with what other middlewares
added. The middleware is built before it is used, so it cannot see the app it
will be used on.

**Fix:** annotate the parameter with what it reads; the middleware then
requires it of the app, before it:

```ts
const i18n = createI18n({
	resources: { en, fr },
	fallback: 'en',
	resolve: ({ user }: BaseContext & { user: User | null }) => user?.language ?? undefined,
});

alxia().plugin(auth).use(i18n); // auth derives user
```

See [Reading the app's context](guide.md#reading-the-apps-context).

### `Property 'user' is missing in type 'BaseContext & Empty' but required in type '{ user: User | null; }'`

```text
error TS2769: No overload matches this call.
  …
          Type 'BaseContext & Empty' is not assignable to type 'MiddlewareContext<{ user: User | null; }>'.
            Property 'user' is missing in type 'BaseContext & Empty' but required in type '{ user: User | null; }'.
```

**When:** `resolve` is annotated to read `user` —
`({ user }: BaseContext & { user: User | null }) => …` — and the middleware is
used on an app, or in a group, whose context has no `user` at that point:
`alxia().use(i18n)`, or `use(i18n)` before `plugin(auth)`.

**Why:** an annotated `resolve` makes the middleware require what it reads, and
`app.use` checks the app's context against it, so `resolve` never runs without
it. An app whose `user` has another type is refused too, with
`Types of property 'user' are incompatible`.

**Fix:** mount what adds `user` first, with the type `resolve`
reads:

```ts
alxia().plugin(auth).use(i18n);
```

More on this message in
[`@alxia/language`'s troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/language/docs/troubleshooting.md#property-user-is-missing-in-type-basecontext--empty-but-required-in-type--user-user--null-).

### `Types of property 'user' are incompatible`

```text
error TS2769: No overload matches this call.
  …
          Type 'BaseContext & Empty & { user: User | null; }' is not assignable to type 'MiddlewareContext<{ user: User; }>'.
            Type 'BaseContext & Empty & { user: User | null; }' is not assignable to type '{ user: User; }'.
              Types of property 'user' are incompatible.
                Type 'User | null' is not assignable to type 'User'.
                  Type 'null' is not assignable to type 'User'.
```

**When:** the app gives a `user`, but of a type that does not fit the one
`resolve`'s parameter is annotated with: a `User | null` where `resolve`
reads `User`, or a user of another shape.

**Why:** `app.use` checks each key the middleware reads against the app's context;
a narrower type passes, a wider or different one does not.

**Fix:** annotate `resolve` with the type the app gives, and handle it
inside:

```ts
resolve: ({ user }: { user: User | null }) => user?.language ?? undefined,
```

More on this message in
[`@alxia/language`'s troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/language/docs/troubleshooting.md#types-of-property-user-are-incompatible).

### `the plugin's resolve reads its context as any: annotate what it reads, or leave it unannotated`

```text
error TS2769: No overload matches this call.
  …
          Type 'BaseContext & Empty' is not assignable to type 'MiddlewareContext<{ readonly '~any': "the plugin's resolve reads its context as any: annotate what it reads, or leave it unannotated"; }>'.
            Property ''~any'' is missing in type 'BaseContext & Empty' but required in type '{ readonly '~any': "the plugin's resolve reads its context as any: annotate what it reads, or leave it unannotated"; }'.
```

**When:** `resolve`'s parameter is annotated `any` —
`resolve: (ctx: any) => ctx.user.language` — or `Record<string, any>`, and
the middleware is used, on any app, whatever its context gives.

**Why:** an `any` parameter reads any key and says nothing of what it
reads, so the middleware would require nothing, and an app without a `user`
would be accepted, and throw on every request. It is refused
instead.

**Fix:** annotate what `resolve` reads —
`({ user }: BaseContext & { user: User | null }) => user?.language ?? undefined` —
and add the plugin or middleware that gives it first; or leave it unannotated when it
reads only the request.

More on this message in
[`@alxia/core`'s troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/core/docs/troubleshooting.md#the-plugins--reads-its-context-as-any-annotate-what-it-reads-or-leave-it-unannotated).

## Messages

### `The intl string context variable "name" was not provided to the string "Hello {name}"`

**When:** in the log, with the response holding the message unformatted:
`Hello {name}`. `t('greeting')` was called without the values its message
names.

**Why:** the values of `t` are not typed by the message. A message that
cannot be formatted is logged with `console.error` — this one with
`code: "MISSING_VALUE"` — and answered as it is; `t` never throws.

**Fix:** pass every value the message names:

```ts
t('greeting', { name: 'Ada' }); // 'Hello Ada'
```

### `SyntaxError: MISSING_OTHER_CLAUSE`

**When:** in the log, with the response holding the message unformatted —
`{count, plural, one {One item}}` — or, for an unclosed brace,
`SyntaxError: EXPECT_ARGUMENT_CLOSING_BRACE` and `Hello {name`.

**Why:** the catalogue holds a message that is not valid ICU. Every
`plural` and `select` needs an `other` case; every `{` its `}`. It is
logged and answered as it is, at every call.

**Fix:** correct the catalogue:

```ts
const en = { cart: { items: '{count, plural, one {One item} other {# items}}' } };
```

### The page shows `home.title` instead of a message

**When:** a response holds a key — `home.title`, `errors.not-found` —
where a message should be, in some languages and not in others.

**Why:** a key the request's catalogue lacks answers **itself**, not the
fallback's message. Either that catalogue is partial — a language added
before every message was translated — or it lacks `@nxgt/i18n`'s shared
keys, which exist only in English and French.

**Fix:** fill a partial catalogue from the fallback's, nested
([Guide](guide.md#messages) shows a `fill` helper), and give a language
`@nxgt/i18n` lacks the English shared keys:

```ts
import { resources as shared } from '@nxgt/i18n';

const en = { ...shared.en, home: { title: 'Welcome' } };
const de = { ...shared.en, home: { title: 'Willkommen' } }; // shared messages in English

export const i18n = createI18n({ resources: { en, de }, fallback: 'en' });
```

## Language

### `i18n.t()` answers in the fallback before the language is read

**When:** a request is in French, but `i18n.t()`, `i18n.language()` or
`@nxgt/i18n`'s `translate` answers in the fallback's language in a
middleware declared before `.use(i18n)`, in a route declared before it, or
in the deprecated `onRequest` and `onResponse` hooks.

**Why:** the middleware reads the request's language when the request
reaches it, and holds it for what runs after it, the answer to an error
included. What is declared before it, and the hooks that run outside the
chain, run with no language to answer in.

**Fix:** translate after the middleware: declare the middlewares and the
routes that translate after `.use(i18n)`, and move what an `onRequest` hook
renders (a deprecated hook) into a middleware declared after it:

```ts
import { alxia, defineMiddleware } from '@alxia/core';

alxia()
	.use(i18n)
	.use(
		defineMiddleware(({ request, reply }, next) =>
			request.headers.has('x-busy')
				? reply(503, { error: i18n.t('errors.service-unavailable') })
				: next(),
		),
	);
```

### `@nxgt/i18n`'s `translate` answers in English on a German request

**When:** your catalogues add a language — `de` — and `@nxgt/i18n`'s
`getLanguage()` answers `'en'` on a request in it, and its `translate` and
the packages that translate through it answer in English.

**Why:** `@nxgt/i18n` only speaks the languages of its own catalogues,
`en` and `fr`. It skips a source that answers another, and falls back to
`'en'`.

**Fix:** translate what the response shows with `t`, whose catalogues are
yours:

```ts
const de = { ...shared.en, errors: { ...shared.en.errors, 'not-found': 'Nicht gefunden.' } };

const i18n = createI18n({ resources: { en: shared.en, de }, fallback: 'en' });

alxia()
	.use(i18n)
	.get('/', ({ t, reply }) => reply(404, { error: t('errors.not-found') })); // ?lang=de → 'Nicht gefunden.'
```

### `getLanguage()` answers `en` although the fallback is `fr`

**When:** outside a request — at start-up, in a timer, a queue consumer —
or in a hook [before the language is read](#i18nt-answers-in-the-fallback-before-the-language-is-read),
`@nxgt/i18n`'s `getLanguage()` answers `'en'` while `i18n.language()`
answers `'fr'`.

**Why:** with no request to read, `@nxgt/i18n` falls back to its own
fallback, `'en'`. Your `fallback` is `createI18n()`'s, and only
`i18n.t()` and `i18n.language()` use it.

**Fix:** call `i18n.t()` rather than `translate` where there is no request,
or pass `translate` the language:

```ts
import { translate } from '@nxgt/i18n';

translate('errors.not-found', undefined, 'fr');
```

### A cache serves one language to every visitor

**When:** behind a CDN, a reverse proxy, or `@alxia/cache`, the first
visitor's language is served to everyone after.

**Why:** the response depends on `Accept-Language` and the language
cookie. The middleware says so in `Vary`; a cache keyed on the URL alone
ignores it.

**Fix:** give the cache the same headers:

```ts
alxia()
	.use(i18n)
	.use(cache({ ttl: 60, vary: ['accept-language', 'cookie'] }));
```

A middleware (or a deprecated `onResponse` hook) that sets `Vary` with `headers.set` replaces the
middleware's: see `@alxia/language`'s [troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/language/docs/troubleshooting.md#a-cache-serves-one-language-to-every-visitor),
which also covers a response in the wrong language — `curl` getting the
fallback, a `?lang=` that does not stick, a `404` on `/fr/products`.
