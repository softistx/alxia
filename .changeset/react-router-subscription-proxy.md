---
'@alxia/react-router': minor
---

`@alxia/react-router/subscription`: `createSubscriptionProxy({ endpoint, allow, getToken, headers?, origin?, heartbeatMs? })`, a resource route's `loader` (GET) and `action` (POST) that expose GraphQL subscriptions to the browser of a BFF over SSE (graphql-sse's distinct connections mode). `allow` maps an operation name to the document the server sends for it: the client names an operation and sends variables, and its own `query` and `extensions` are ignored. Both methods refuse a cross-site request and a POST that is not JSON, the bearer comes from the session (401 without one), requests are size-limited, a heartbeat keeps the stream open, the relay is pulled and capped, the browser leaving aborts the upstream request, and an upstream 429 is passed on with `retryAfter`. It imports nothing and adds no peer. Additive.
