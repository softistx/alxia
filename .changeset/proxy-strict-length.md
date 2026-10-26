---
'@alxia/proxy': patch
---

A declared `Content-Length` is read as digits only, as `@alxia/core` 0.16.0 reads it: `1e3` or `0x10` on a `Request` built in process is no longer taken as 1000 or 16 and refused unread; it is counted instead.
