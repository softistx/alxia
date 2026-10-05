---
"@alxia/telemetry": patch
---

For `@alxia/core`'s dev comfort: `telemetry` is marked with `markFactory`, so given uncalled it throws where it is declared, naming itself, rather than answering each request 500; the middleware it makes is a named function, which the dev route table shows.
