# Roadmap

What `@alxia/cors` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/cors/CHANGELOG.md).

## Now

Nothing in progress.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **A runtime dependency.** `@alxia/cors` declares no dependency, only
  peers: it is built on `@alxia/core`'s public API and the web
  platform's `Headers` and `Response`.

## Shipped

### 0.3.0

- **CORS as a middleware.** `app.use(cors(options))`, declared first,
  answers a preflight to any path before routing's `404` or `405`, and adds
  the headers to every other response, a `404`'s and an error's included;
  `app.plugin(cors(options))`, its deprecated alias, was removed in 0.5.

### 0.1.0

- **CORS as one plugin**, the 0.1 form. `cors(options)` sets the policy for
  the whole app, every route and every error response included, and adds
  nothing to the app's type.
- **Preflights answered before routing.** An `OPTIONS` with
  `Access-Control-Request-Method` gets a `204` with the allowed methods and
  headers, whether or not a route matches its path, and no route runs.
- **Origins your way.** `origin` takes every origin, one, a `RegExp`, a list
  of either, or a function; an allowed origin is echoed back, a refused one
  gets no CORS header, and `Vary: Origin` keeps caches from mixing them up.
- **Credentials that work.** With `credentials`, the request's origin is
  sent instead of `*`, which a browser refuses on a call with cookies.
- **The rest of the protocol.** `methods` (every method a route can have
  by default, `QUERY` included), `allowedHeaders` (by default,
  those the browser asks for), `exposedHeaders`, `maxAge`, and Chrome's
  Private Network Access preflight with `privateNetwork`.
