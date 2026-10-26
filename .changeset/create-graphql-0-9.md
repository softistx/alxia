---
'@alxia/create': patch
---

New `graphql` projects install `@alxia/graphql` 0.9, whose defaults are breaking: a document may hold at most 15 000 tokens (`maxTokens`), and a `POST` body at most 1 MiB (`bodyLimit`).
