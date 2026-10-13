# Troubleshooting

Each entry is headed by the text you see: the error `createI18n()` throws,
an error from `tsc`, a line in the log, or — for a trap that prints
nothing — what the response does that you did not expect.

**At start-up**

- [`TypeError: setResources(): there is no catalogue for the fallback "en"`](#typeerror-setresources-there-is-no-catalogue-for-the-fallback-en)
- [`TypeError: createI18n(): there is no catalogue for the fallback "de"`](#typeerror-createi18n-there-is-no-catalogue-for-the-fallback-de)

**Types**

- [`Type '"de"' is not assignable to type '"en" | "fr"'`](#type-de-is-not-assignable-to-type-en--fr-ts2769)
- [`Argument of type '"cart.itmes"' is not assignable to parameter of type '"cart.items"'`](#argument-of-type-cartitmes-is-not-assignable-to-parameter-of-type-cartitems)
- [`Property 't' does not exist on type 'Context<Empty, "/", Empty>'`](#property-t-does-not-exist-on-type-contextempty--empty)
- [`this looks like a factory given uncalled: call it, as use(cors()) and not use(cors)`](#this-looks-like-a-factory-given-uncalled-call-it-as-usecors-and-not-usecors)
- [`Object literal may only specify known properties, and 'supported' does not exist in type 'I18nOptions<…>'`](#object-literal-may-only-specify-known-properties-and-supported-does-not-exist-in-type-i18noptions)
- [`t()` accepts any key, typos included](#t-accepts-any-key-typos-included)
- [`Property 'user' does not exist on type 'BaseContext'`](#property-user-does-not-exist-on-type-basecontext)
- [`user` is missing from the context: add a middleware that gives it before this one](#user-is-missing-from-the-context-add-a-middleware-that-gives-it-before-this-one)
- [`user` is in the context with another type than this middleware reads](#user-is-in-the-context-with-another-type-than-this-middleware-reads)
- [`the plugin's resolve reads its context as any: annotate what it reads, or leave it unannotated`](#the-plugins-resolve-reads-its-context-as-any-annotate-what-it-reads-or-leave-it-unannotated)

**Messages**

- [`The intl string context variable "name" was not provided to the string "Hello {name}"`](#the-intl-string-context-variable-name-was-not-provided-to-the-string-hello-name)
- [`SyntaxError: MISSING_OTHER_CLAUSE`](#syntaxerror-missing_other_clause)
- [The page shows `home.title` instead of a message](#the-page-shows-hometitle-instead-of-a-message)
- [`fallBackTo()` changes nothing](#fallbackto-changes-nothing)
- [A request still speaks the old catalogues after `setResources()`](#a-request-still-speaks-the-old-catalogues-after-setresources)

**Language**

- [`i18n.t()` answers in the fallback before the language is read](#i18nt-answers-in-the-fallback-before-the-language-is-read)
- [`@nxgt/i18n`'s `translate` answers in English on a German request](#nxgti18ns-translate-answers-in-english-on-a-german-request)
- [`getLanguage()` answers `en` although the fallback is `fr`](#getlanguage-answers-en-although-the-fallback-is-fr)
- [A cache serves one language to every visitor](#a-cache-serves-one-language-to-every-visitor)

## At start-up

### `TypeError: createI18n(): there is no catalogue for the fallback "de"`

**When:** `createI18n()` is called — when the module that builds it is
imported — with a `fallback` that is not one of `resources`' keys.

**Why:** the fallback is the language of every request that names none the
catalogues have, so it needs a catalogue. The types refuse it when they can
see the keys of `resources`; they cannot when `fallback` comes from the
environment through a cast, or `resources` is typed `Record<string, …>`.
With `languages` and no `resources` (`createI18n<Key>({ languages, fallback })`),
the message is `@alxia/language`'s instead, `language(): the fallback "de" is not supported`:
add the fallback to `languages`.

**Fix:** give the fallback a catalogue, and keep `resources` a literal so
the compiler checks it next time:

```ts
import { createI18n } from '@alxia/i18n';

const en = { home: { title: 'Welcome' } };
const de = { home: { title: 'Willkommen' } };

createI18n({ resources: { en, de }, fallback: 'de' });
```

### `TypeError: setResources(): there is no catalogue for the fallback "en"`

**When:** `i18n.setResources({ fr })` is called with catalogues that lack
the `fallback` language.

**Why:** the fallback is the language of every request that names none, so
it must stay supported. Nothing changed: the previous catalogues are still
in force.

**Fix:** include the fallback's catalogue, or build the instance with the
fallback you will keep:

```ts
import { createI18n } from '@alxia/i18n';

const i18n = createI18n<'home.title'>({ fallback: 'en' });

i18n.setResources({ en: { home: { title: 'Welcome' } }, fr: { home: { title: 'Bienvenue' } } });
```

## Types

### `Type '"de"' is not assignable to type '"en" | "fr"'` (TS2769)

```text
error TS2769: No overload matches this call.
  Overload 1 of 2, '(options: I18nOptions<…>): I18nMiddleware<…>', gave the following error.
    Type '"de"' is not assignable to type '"en" | "fr"'.
  Overload 2 of 2, '(options: "name the keys with createI18n<Key>(…), or give resources whose fallback is one of their languages"): …', gave the following error.
    Argument of type '{ resources: { … }; fallback: string; }' is not assignable to parameter of type '"name the keys with createI18n<Key>(…), or give resources whose fallback is one of their languages"'.
```

**When:** `createI18n({ resources: { en, fr }, fallback: 'de' })`.

**Why:** `fallback` is typed as one of `resources`' keys. This is the
compile-time form of [the start-up error](#typeerror-createi18n-there-is-no-catalogue-for-the-fallback-de).

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

### `this looks like a factory given uncalled: call it, as use(cors()) and not use(cors)`

```text
error TS2345: Argument of type '{ <const C extends Catalogues, …>(options: I18nOptions<C, Fallback, Ctx>): I18nMiddleware<…>; <Key extends string = never, …>(options: …): I18nMiddleware<…>; }' is not assignable to parameter of type '{ … } & ((ctx: …, next: NextFunction) => … & "this looks like a factory given uncalled: call it, as use(cors()) and not use(cors)")'.
  …
```

**When:** `app.use(createI18n)`, the factory given uncalled. The message names
`cors` as its example, whichever factory it is. It also throws where it is
declared, since alxia 0.5, rather than answering each request with a 500:

```text
TypeError: use(): argument 1 looks like a factory (createI18n): call it, use(createI18n())
```

**Why:** `createI18n` makes the middleware; it is not the middleware. A
function that returns a function is no middleware, and `createI18n` is marked
as a factory, so `use`, a route and `plugin` refuse it.

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

### `t()` accepts any key, typos included

**When:** the catalogues are built at runtime, read with
`await Bun.file(…).json()`, or annotated
`Record<string, Record<string, string>>`.

**Why:** the keys are read from the fallback catalogue's type. A catalogue
typed `Record<string, …>` has none to read, so `t` takes any string — and
a wrong one [answers itself](#the-page-shows-hometitle-instead-of-a-message).

**Fix:** declare the catalogues as literals, or import them from JSON
files, which keeps their keys in the type (`resolveJsonModule` in your
`tsconfig.json`), or name the keys yourself with
[`createI18n<Key>()`](guide.md#catalogues-loaded-at-runtime):

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

### `user` is missing from the context: add a middleware that gives it before this one

```text
error TS2345: Argument of type 'I18nMiddleware<"en" | "fr", "home.title", { user: User | null; }>' is not assignable to parameter of type 'Middleware<{ user: User | null; }, …> & { … } & ((ctx: MiddlewareContext<…>, next: NextFunction) => … & "`user` is missing from the context: add a middleware that gives it before this one")'.
  …
      Type 'Promise<…>' is not assignable to type '"`user` is missing from the context: add a middleware that gives it before this one"'.
```

**When:** `resolve` is annotated to read `user` —
`({ user }: BaseContext & { user: User | null }) => …` — and the middleware is
used on an app, or in a group, whose context has no `user` at that point:
`alxia().use(i18n)`, or `use(i18n)` before `plugin(auth)`.

**Why:** an annotated `resolve` makes the middleware require what it reads, and
`app.use` checks the app's context against it, so `resolve` never runs without
it. An app whose `user` has another type is refused too, with
`user` is in the context with another type than this middleware reads.

**Fix:** mount what adds `user` first, with the type `resolve`
reads:

```ts
alxia().plugin(auth).use(i18n);
```

More on this message in
[`@alxia/language`'s troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/language/docs/troubleshooting.md#property-user-is-missing-in-type-basecontext--empty-but-required-in-type--user-user--null-).

### `user` is in the context with another type than this middleware reads

```text
error TS2345: Argument of type 'I18nMiddleware<"en" | "fr", "home.title", { user: User; }>' is not assignable to parameter of type 'Middleware<{ user: User; }, …> & { … } & ((ctx: MiddlewareContext<…>, next: NextFunction) => … & "`user` is in the context with another type than this middleware reads")'.
  …
      Type 'Promise<…>' is not assignable to type '"`user` is in the context with another type than this middleware reads"'.
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

**Fix:** give `t()` a [chain](guide.md#the-fallback-chain) —
`fallbacks: () => ['en']` — so that a missing key answers the next
language's message; or fill a partial catalogue from the fallback's, nested
([Guide](guide.md#messages) shows a `fill` helper), and give a language
`@nxgt/i18n` lacks the English shared keys:

```ts
import { createI18n } from '@alxia/i18n';
import { resources as shared } from '@nxgt/i18n';

const en = { ...shared.en, home: { title: 'Welcome' } };
const de = { ...shared.en, home: { title: 'Willkommen' } }; // shared messages in English

export const i18n = createI18n({ resources: { en, de }, fallback: 'en' });
```

### `fallBackTo()` changes nothing

**When:** `i18n.fallBackTo('fr')` is called and `t()` still answers the key,
or `i18n.chain()` lacks the language.

**Why:** the step lives in the frame of the request running, opened by
`use(i18n)`. Called outside a request — at start-up, in a job — or in a
request that `use(i18n)` did not run on (a route declared before it), it
does nothing. It also affects only the `t()` calls after it, and only the
instance it is called on: two `createI18n()` have two chains.

**Fix:** call it from a middleware, a `derive` or Yoga's `context` declared
after `app.use(i18n)`, before the `t()` it should affect:

```ts
import { alxia } from '@alxia/core';
import { createI18n } from '@alxia/i18n';

const en = { home: { title: 'Welcome' } };
const fr = { home: { soon: 'Bientôt' } };
const i18n = createI18n({ resources: { en, fr }, fallback: 'en' });

alxia()
	.use(i18n)
	.use((_ctx, next) => {
		i18n.fallBackTo('fr');
		return next();
	})
	.get('/', ({ t, reply }) => reply(200, t('home.soon')));
```

### A request still speaks the old catalogues after `setResources()`

**When:** `i18n.setResources(next)` ran, and a response still holds the
previous messages.

**Why:** a request keeps the catalogues it started with; only the requests
that start after the call read the new ones. `supported` and
`i18n.t()` outside a request change at once.

**Fix:** nothing to fix for a request in flight; it ends with the messages it
began with. If requests that started after the call are stale, the call
ran on another `createI18n()` instance than the one the app uses, or
a cache serves the old response ([cache](#a-cache-serves-one-language-to-every-visitor)).

## Language

### `i18n.t()` answers in the fallback before the language is read

**When:** a request is in French, but `i18n.t()`, `i18n.language()` or
`@nxgt/i18n`'s `translate` answers in the fallback's language in a
middleware declared before `.use(i18n)`, or in a route declared before it.

**Why:** the middleware reads the request's language when the request
reaches it, and holds it for what runs after it, the answer to an error
included. What is declared before it runs with no language to answer in.

**Fix:** translate after the middleware: declare the middlewares and the
routes that translate after `.use(i18n)`, and move what a middleware before
it renders into a middleware declared after it:

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

**Why:** `@nxgt/i18n` only speaks the languages it has a catalogue for: `en`
and `fr`, and what `registerCatalogue()` added. It skips a source that
answers another, and falls back to its own fallback language, `'en'` unless
`setFallbackLanguage()` changed it.

**Fix:** register the language with `@nxgt/i18n` (`registerCatalogue('de',
catalogue)`, deep-merged over what it has), or translate what the response
shows with `t`, whose catalogues are yours:

```ts
const de = { ...shared.en, errors: { ...shared.en.errors, 'not-found': 'Nicht gefunden.' } };

const i18n = createI18n({ resources: { en: shared.en, de }, fallback: 'en' });

alxia()
	.use(i18n)
	.get('/', ({ t, reply }) => reply(404, { error: t('errors.not-found') })); // ?lang=de → 'Nicht gefunden.'
```

### `getLanguage()` answers `en` although the fallback is `fr`

**When:** outside a request — at start-up, in a timer, a queue consumer —
or in a middleware [before the language is read](#i18nt-answers-in-the-fallback-before-the-language-is-read),
`@nxgt/i18n`'s `getLanguage()` answers `'en'` while `i18n.language()`
answers `'fr'`.

**Why:** with no request to read, `@nxgt/i18n` falls back to its own
fallback, `'en'`. Your `fallback` is `createI18n()`'s, and only
`i18n.t()` and `i18n.language()` use it.

**Fix:** call `i18n.t()` rather than `translate` where there is no request,
pass `translate` the language, or set `@nxgt/i18n`'s fallback to yours
(`setFallbackLanguage('fr')`, which needs a catalogue for `fr`):

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

A middleware that sets `Vary` with `headers.set` replaces the
middleware's: see `@alxia/language`'s [troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/language/docs/troubleshooting.md#a-cache-serves-one-language-to-every-visitor),
which also covers a response in the wrong language — `curl` getting the
fallback, a `?lang=` that does not stick, a `404` on `/fr/products`.
