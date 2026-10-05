---
"@alxia/janus": patch
---

For `@alxia/core`'s dev comfort: `session`, `permission` and `janusErrors` are marked with `markFactory`, so each, given uncalled, throws where it is declared, naming itself, rather than answering each request 500; the middleware each makes is a named function, which the dev route table shows.
