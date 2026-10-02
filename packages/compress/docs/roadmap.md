# Roadmap

What `@alxia/compress` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/compress/CHANGELOG.md).

## Now

Nothing scheduled yet.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **A runtime dependency.** `@alxia/compress` installs nothing beside its
  `@alxia/core` peer: zstd, gzip and deflate come from the runtime's
  `CompressionStream`, and Brotli from `node:zlib`, so adding it to an app
  adds no native binding or transitive package to audit or update.

## Shipped

### 0.1.0

- **Compression as a plugin.** `app.use(compress())` streams every response
  worth it through zstd, Brotli, gzip or deflate, chosen from the client's
  `Accept-Encoding` and the server's order of preference, with the app's
  routes and the client's types unchanged.
- **Only what pays.** Text, JSON, JavaScript, XML and SVG of at least 1 KiB
  by default, with the encodings, the threshold and the types compressed as
  options. An event stream, a `HEAD`, a 204, 206 or 304, a response already
  encoded — a precompressed static file — or one marked
  `Cache-Control: no-transform` is sent as it is.
- **Cache-safe headers.** `Vary: Accept-Encoding` on every compressible
  response, a strong `ETag` made weak, and no stale `Content-Length`.
- **`negotiate`.** The same choice of encoding, exported for a handler or a
  plugin that encodes on its own.
