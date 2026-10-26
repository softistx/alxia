---
'@alxia/react-router': minor
---

`createApiErrors` takes an optional `reword(text, error, { code, values, language })` to word a whole family of codes once, such as adding a suffix to every `*.errors.referenced` refusal. It runs on the final text of an API error, whether the catalogue, the API's message or `byCode` produced it, receives the merged values the catalogue formats with, and returns the text to show or `undefined` to keep it. It does not apply to `refused`, `unavailable` or the entries of `extensions.fields`. Without it nothing changes.
