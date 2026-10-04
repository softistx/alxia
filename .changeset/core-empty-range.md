---
"@alxia/core": patch
---

A range request on an empty file is answered `416` with `Content-Range: bytes */0`, a suffix range (`bytes=-5`) included, where it was a `206` with `Content-Range: bytes 0--1/0`.
