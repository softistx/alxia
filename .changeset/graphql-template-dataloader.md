---
"@alxia/create": minor
---

The `graphql` template batches `Note.author` with a DataLoader built per request in the `context` option, so a list of notes loads its authors in one call instead of one per note. `dataloader` is a new dependency of the generated project, and its spec asserts one batch for N notes.
