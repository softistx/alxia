---
"@alxia/core": minor
---

`app.file(path, file, { precompressed })` serves the `.br`, `.zst` or `.gz` copy beside a file given as a path on disk to a client that accepts it, as `app.static` does, with `Content-Encoding` and `Vary: Accept-Encoding`. `precompressed` moves from `StaticOptions` to `FileOptions`, which it extends: nothing changes for `static`.
