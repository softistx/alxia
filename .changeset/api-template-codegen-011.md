---
'@alxia/create': patch
---

The `api` template moves to `@nxgt/openapi-codegen` 0.11.0 (still pinned exactly), `@nxgt/httpyz` ^0.4.1 and `@nxgt/openapi-httpyz` ^0.3.2. The regenerated `src/generated/operations.ts` gains one optional field on `OperationSpec`, `queryMethod?: true`; no operation, type or schema changed.
