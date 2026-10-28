---
'@alxia/react-router': minor
---

`@alxia/react-router/subscription`: `createSubscriptionProxy({ endpoint, allow, getToken, headers?, heartbeatMs? })`, a resource route's `loader` (GET) and `action` (POST) that expose a GraphQL subscription to the browser of a BFF over SSE (graphql-sse's distinct connections mode). Only named subscriptions of `allow` (or listed persisted ids) are forwarded, the bearer comes from the session (401 without one), a heartbeat keeps the stream open, the browser leaving aborts the upstream request, and an upstream 429 is passed on with `retryAfter`. It imports nothing and adds no peer. Additive.
