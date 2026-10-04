# Roadmap

What `@alxia/secure-headers` gives an app, and what is coming. This page is
a direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/secure-headers/CHANGELOG.md).

## Now

- **Secure headers as a middleware.** `app.use(secureHeaders())`, declared
  first, sets the headers on every response that comes back through it, a
  404's, an error's and a 500's included; `NonceMiddleware` gives `nonce` to the
  routes after it and `SecureHeaders` is the plain one.
  `app.plugin(secureHeaders())` keeps working as a deprecated alias.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **A runtime dependency.** The package installs nothing beside itself: the
  headers are written on `@alxia/core`'s public API, its peer, so adding it
  to an app adds no transitive package to audit or update.

## Shipped

### Next release

- **A nonce per request.** `secureHeaders({ nonce: true })` makes a fresh,
  random nonce for each request, adds it to the policy's `script-src`, or
  wherever the policy names `NONCE`, and gives the same one to the routes
  after it as `ctx.nonce`, typed. A page's inline scripts run without
  `'unsafe-inline'`; `@alxia/react-router`'s `nonceOf` hands it to React
  Router. Without the option, nothing changes.

### 0.1.0

- **Secure headers on every response.** `secureHeaders()` is a plugin for
  `app.plugin` that sends `Content-Security-Policy`, `Strict-Transport-Security`,
  `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`,
  `Origin-Agent-Cluster`, `X-DNS-Prefetch-Control` and
  `X-Permitted-Cross-Domain-Policies` with strict defaults for an API, on
  every response — 404s, 405s and 500s included.
- **Each header adjustable.** Every option takes the header's value, or
  `false` to leave it out, and an empty value is refused at startup;
  `Cross-Origin-Embedder-Policy` and `Permissions-Policy` are sent only when
  given.
- **A route's own header wins.** A header a route sets on its reply is kept,
  so a page that needs its own policy sets it there.
- **No `X-Powered-By` or `Server`.** Both are removed from every response,
  unless `hidePoweredBy: false`.
