# Roadmap

What `@alxia/i18n` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/i18n/CHANGELOG.md).

## Now

Nothing in progress.

## Next

- **Hot reload of the catalogues.** `@nxgt/i18n` gets a `CatalogueSource`,
  `load()` for the catalogues and `version()` for a cheap version string,
  and a watcher that polls `version()` and calls `onChange` when it moves;
  `@alxia/i18n` then feeds the result to `setResources()`, so an app picks
  up edited catalogues without a restart and a request in flight keeps the
  ones it started with. Needs the `setResources()` of 0.4.0.

## Later

Nothing scheduled yet.

## Not planned

- **A runtime dependency.** `@alxia/i18n` declares no dependency, only
  peers — `@alxia/core`, `@alxia/language`, `@nxgt/i18n` and `typescript`:
  it is built on their public APIs and Node's `AsyncLocalStorage`.

## Shipped

### 0.4.0

- **A key-level fallback chain.** The `fallbacks` option, `i18n.fallBackTo()`
  for one request and `i18n.chain()`: `t()` tries the request's language, the
  request's steps, `fallbacks(language)`, then `fallback`, and answers the key
  only when all miss.
- **Catalogues loaded at runtime, keys typed.** `createI18n<Key>({ fallback })`
  names the keys, `i18n.setResources()` swaps the catalogues atomically,
  `supported` follows, and a request keeps the ones it started with.

### 0.3.0

- **A middleware, not a plugin (0.4).** `app.use(createI18n({ ... }))` runs on every request, a 404 included; its `t()` works in every middleware after it and in the answer to an error. `app.plugin(i18n)`, the deprecated plugin form, was removed with alxia 0.5: give it to `use`.

### 0.1.0

- **Translations as one plugin.** `alxia().use(createI18n({ resources, fallback }))`
  gives the routes after it `t`, bound to the request's language, and
  `language`, typed as one of the catalogues' languages.
- **The request's language, found by `@alxia/language`.** The query, a
  cookie, `Accept-Language`, then `fallback`; its options pass through.
- **A preference an earlier plugin knows.** Annotate `resolve`'s parameter —
  `({ user }: BaseContext & { user: User }) => user.language` — and it reads
  what an earlier plugin added; an app that does not give it cannot use the
  plugin, and one annotated `any` is refused. The languages and keys stay
  inferred from `resources` and `fallback`.
- **Keys typed by your catalogue.** `t` takes the dotted keys of the
  fallback's catalogue, from a literal or a JSON file, and refuses a typo.
- **ICU messages.** Plurals, selects and numbers, formatted by `@nxgt/i18n`
  in the request's language; a missing key answers itself, a message that
  cannot be formatted is logged and answered as it is.
- **`t()` anywhere a request runs.** The plugin's own `t()` and
  `language()` follow the request through every `await` — a service, a
  model — and answer in the fallback outside one.
- **`@nxgt/i18n` speaks it too.** The request's language is registered as
  one of `@nxgt/i18n`'s sources, so its `getLanguage()` and `translate`
  follow the alxia request.
