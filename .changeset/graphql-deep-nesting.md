---
'@alxia/graphql': minor
---

`graphql()` now refuses a document nested too deeply with a GraphQL error, not a 500.

- **A document may nest 1 000 levels by default (`maxDepth`).** graphql-js
  parses by recursion, so a query nested a few thousand levels deep
  (`{ a { a { …`) overflowed the stack while still under `maxTokens`, and
  answered a 500 `Unexpected error.` that was logged. It is now refused
  before the parser recurses into it, as `GRAPHQL_PARSE_FAILED` (400 under
  `application/graphql-response+json`), over POST, GET, a batch and a
  WebSocket, and nothing is logged. A document that still overflows the stack
  is refused the same way.
- **A document nested past 1 000 levels worked before on a runtime whose
  stack allowed it and is refused now.** Raise it with `maxDepth: 2_000`, or
  turn the check off with `maxDepth: false`. An invalid `maxDepth` throws a
  `TypeError` where `graphql()` is declared.
