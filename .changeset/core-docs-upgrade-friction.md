---
"@alxia/core": patch
---

Docs only: `upgrading.md` gains the 0.6.0 and 0.7.0 sections, its 0.4.0 note on a group's middlewares and unmatched requests no longer contradicts the Middleware guide (a group with a prefix guards the unmatched requests under it; one without adds none), a spec pins that for a group without a prefix and a group in a mounted app, and Routes gains a recipe for a refusal handler scoped to some routes.
