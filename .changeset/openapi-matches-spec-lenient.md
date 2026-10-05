---
'@alxia/openapi': minor
'@alxia/create': patch
---

`matchesSpec` no longer fails on a route no operation declares. An app may serve routes its document does not describe (proxied, health, docs, hand-written) and still match it. It still throws on each operation with no route, which includes a route of another method or path than its operation. `strict: true` restores the exhaustive check, `exclude` and the `apiDocs()` and `health()` skips included; `matchesSpec` now returns a `MatchesSpecReport`, `{ extra: { method, path }[] }`, listing the undocumented routes without failing. The `api` template's spec test drops "and nothing else" from its title.

Upgrading: to keep the old check, pass `strict: true`.
