---
'@alxia/graphql': minor
---

`graphql()` now bounds what it parses and keeps.

- **A document may hold 15 000 tokens by default (`maxTokens`).** A longer
  query is refused by the parser before anything runs, as `GRAPHQL_PARSE_FAILED`
  with `Document contains more than 15000 tokens`: HTTP 400 under
  `application/graphql-response+json`, 200 with `errors` under
  `application/json`. It covers `POST`, `GET`, each operation of a batch and
  each operation over WebSocket. **A query over 15 000 tokens worked before
  and is refused now.** The introspection query is 163 tokens and a large
  screen query a few thousand, so most clients are unaffected. To opt out, give
  `maxTokens: false`, or raise it with `maxTokens: 30_000`.
- **The parse cache is bounded by weight (`parseCache`).** Yoga's own keeps up
  to 1 024 documents of any size, which holds gigabytes for distinct large
  queries. Each endpoint now keeps 64 MiB of parsed documents (1 024 documents
  at most, one hour), weighed by tokens. Size it with
  `parseCache: { maxBytes, max, ttl }`, or turn it off with `parseCache: false`.
  An app that gives Yoga's `parserAndValidationCache` keeps its own cache;
  giving it together with `parseCache` throws where `graphql()` is declared.
