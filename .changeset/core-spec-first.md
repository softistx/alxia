---
"@alxia/core": minor
---

OpenAPI spec first: `Alxia` no longer carries a route table for a client. It is `Alxia<Ctx, Prefix, Shortcuts>` — the `Routes` type parameter, the `~routes` field and `RoutesOf` are gone, with the types that only described a route to a client (`RouteEntryOf`, `RouteInput`, `RouteOutput`, `RouteRecord`, `RouteTable`, `Outcome`, `OutcomeOf`, `SocketEntryOf`, `SocketRecord`, `RefusalOutcome`, `KindOutcome`, `DefaultRefusalOutcome`, `DefaultLimitOutcome`, `IsLimited`, `BehindShortcuts`, `ThreadReplies`, `AppWithSocket`); `AppWithRoute<App>` takes the app alone. A route returns the app unchanged in type; what a handler reads is typed as before. A client is generated from the OpenAPI document, with `@nxgt/openapi-codegen` for example; `@alxia/client` is retired. `route(operation, ...middlewares, handler)` now types a part the operation has no schema for as the middleware before it passed it, as it runs. See the upgrading guide.
