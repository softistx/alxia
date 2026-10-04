---
"@alxia/core": patch
---

A range request on an empty file no longer answers `206` with `Content-Range: bytes 0--1/0`. A suffix range (`bytes=-5`), the only one RFC 9110 calls satisfiable on an empty file, is served whole as a `200`; any other range (`bytes=0-`, `bytes=-0`) is a `416` with `Content-Range: bytes */0`.
