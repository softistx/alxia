---
'@alxia/react-router': minor
---

Add `@alxia/react-router/errors`, the code with no UI that words an API's refusals for the page. Its first slice holds the shape of a GraphQL API's refusal, declared structurally so the subpath needs no `@nxgt/graphql-client` at runtime: `ApiErrorLike` (and `ApiErrorEntryLike`, `ApiErrorExtensionsLike`, `ApiFieldErrorLike`), `isApiErrorLike` (the test the client's own `isApiError` makes, which holds across two copies of it) and `waitMinutes` (the minutes of a throttle's wait); `REQUEST_ID_HEADER` and `requestIdOf(response)`, the id an API echoes on a response; `nextOf(url)`, the page a request is for without React Router's single-fetch details, for the `next` that carries it back after sign-in; and `FormErrors`, what a form action answers when the API refused the input. The subpath imports `react-router` and `react` only, never `@alxia/core`.
