# Roadmap

What `@alxia/compress` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/compress/CHANGELOG.md).

## Now

- **Compression as a middleware.** `app.use(compress())` compresses every
  response that comes back through it, a 404's and an error's included;
  `app.plugin(compress())` keeps working as a deprecated alias.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **A runtime dependency.** `@alxia/compress` installs nothing beside its
  `@alxia/core` peer: zstd, gzip and deflate come from the runtime's
  `CompressionStream`, and Brotli and every streamed body from `node:zlib`,
  so adding it to an app adds no native binding or transitive package to
  audit or update.

## Shipped

### 0.1.0

- **Compression as a plugin.** `app.plugin(compress())` streams every response
  worth it through zstd, Brotli, gzip or deflate, chosen from the client's
  `Accept-Encoding` and the server's order of preference, with the app's
  routes and type unchanged.
- **Only what pays.** Text, JSON, JavaScript, XML and SVG of at least 1 KiB
  by default — files included — with the encodings, the threshold and the
  types compressed as options. An event stream (unless `compressible` lets
  it in), a `HEAD`, a 204, 206 or 304, a response already encoded — a
  precompressed static file — or one marked `Cache-Control: no-transform`
  is sent as it is. Brotli runs at quality 4, near gzip's speed, rather
  than the ahead-of-time default of 11.
- **Streamed bodies flushed as they come.** A body with no
  `Content-Length` — a server-rendered page, a `ReadableStream`, an event
  stream that `compressible` lets in — is flushed after the chunks of each
  turn of the event loop, in all four encodings, so a page's shell reaches
  the browser at once instead of with its last deferred part. A body with a
  length is compressed whole, as before.
- **Cache-safe headers.** `Vary: Accept-Encoding` on every compressible
  response, a strong `ETag` made weak, and no stale `Content-Length` or
  `Accept-Ranges`.
- **`negotiate`.** The same choice of encoding, exported for a handler or a
  plugin that encodes on its own.
