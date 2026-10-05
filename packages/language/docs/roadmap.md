# Roadmap

What `@alxia/language` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/language/CHANGELOG.md).

## Now

- **A middleware, not a plugin (0.4).** `app.use(language({ ... }))` runs on every request, a 404 included, which then says `Content-Language` and `Vary` too. `app.plugin(language(...))`, the deprecated plugin form, was removed with alxia 0.5: give it to `use`.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **A runtime dependency.** `@alxia/language` declares no dependency, only
  peers — `@alxia/core` and `typescript`: it is built on `@alxia/core`'s
  public API and Bun's own `Bun.CookieMap`.

## Shipped

### 0.1.0

- **The request's language, typed.** `alxia().use(language({ supported, fallback }))`
  gives the routes after it `language`, typed as one of `supported` — never
  a string a client made up — and `languageSource`, which says what decided.
- **Four sources, in your order.** The query, a cookie, a path segment and
  `Accept-Language`, read in `order`, then a `resolve` of your own, then
  `fallback`.
- **`Accept-Language` negotiated.** Weights and refusals honoured; a tag
  matched whatever its case, by its base language (`fr-CA` for `fr`), or by
  a region of it (`pt` for `pt-BR`). `negotiate`, `parseAcceptLanguage` and
  `match` are exported for use outside a request.
- **The response says it.** `Content-Language` on every response, `Vary` by
  the headers read, and, with `persist`, a language named in the query kept
  in a cookie.
- **A preference an earlier plugin knows.** Annotate `resolve`'s parameter —
  `({ user }: BaseContext & { user: User }) => user.language` — and it reads
  what an earlier plugin added; an app that does not give it cannot use the
  plugin. Unannotated, it reads the request alone and requires nothing.
- **No silent `any`.** A `resolve` annotated `any` would require nothing
  and turn the check off; the plugin is refused on every app instead, with
  a message naming `resolve`.
- **A fallback that cannot be wrong.** The types refuse a fallback the app
  does not support, and so does the plugin at start-up.
