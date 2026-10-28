---
"@alxia/react-router": patch
---

The default API-code pattern (`API_CODE`, used by `createApiErrors` and `apiCodeResolver` when no `isApiCode` is given) accepts a camelCase module, such as `nightActions.errors.already-acted`. Before, such a code fell back to the generic refusal. A module must still start with a lowercase letter.
