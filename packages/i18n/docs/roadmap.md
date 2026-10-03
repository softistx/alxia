# Roadmap

What `@alxia/i18n` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/i18n/CHANGELOG.md).

## Now

Nothing scheduled yet.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **A runtime dependency.** `@alxia/i18n` declares no dependency, only
  peers — `@alxia/core`, `@alxia/language`, `@nxgt/i18n` and `typescript`:
  it is built on their public APIs and Node's `AsyncLocalStorage`.

## Shipped

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
