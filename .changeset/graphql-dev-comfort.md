---
"@alxia/graphql": patch
---

For `@alxia/core`'s dev comfort: the endpoint's handler is named `graphql`, so the dev route table shows `GET /graphql … → graphql` and `POST /graphql … → graphql`. A resolver's error stays in Yoga's `errors[]`, and the dev error page never replaces it.
