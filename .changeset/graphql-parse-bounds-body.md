---
'@alxia/graphql': minor
---

`graphql()` now limits the body of a `POST`, and its 413 keeps Yoga's headers.

- **A `POST` body may hold 1 MiB by default (`bodyLimit`).** A bigger body is
  refused with core's 413 before Yoga reads it. **A body over 1 MiB worked
  before and is refused now.** An app that declared its own `bodyLimit()`
  before `graphql()` keeps that limit. To change it, give
  `graphql(app, { schema, bodyLimit: 5 * 1024 * 1024 })`; a mutation that
  takes a file by `multipart` needs a larger one. An invalid value throws a
  `TypeError` where `graphql()` is declared.
- **The 413 carries the headers Yoga's plugins set.** A `Cache-Control:
  no-store` set from an `onResponse` hook was missing from it. Its body and
  `content-type` stay core's, in the app's error format.
- **A form-urlencoded or `application/graphql` body past the limit logs no
  stack trace.** Yoga used to print the error twice for these content types.
