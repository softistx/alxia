---
"@alxia/core": minor
"@alxia/openapi": minor
---

`onRefusal(kind, [schema,] hook)`: a hook per refusal kind. `onRefusal('validation', …)` and `onRefusal('body_limit', …)` each answer one kind, read it narrowed (`ValidationRefusal`, `BodyLimitRefusal`), and, given schemas, check and type that kind's replies apart: a route's type, the client and the OpenAPI document see the validation hook's replies where the route validates and the body-limit hook's where it has a `bodyLimit`. A kind with no hook of its own, or whose hook returns nothing, falls back to the general `onRefusal(hook)`, then to the default. `onRefusal(hook)` and `onRefusal(schema, hook)` are unchanged. New exports: `RefusalKind`, `RefusalOfKind`, `RefusalHandlersByKind` (`RouteDefinition['refusalByKind']`), `RefusalMethod` (the type of `onRefusal`, now a property typed as the route methods are), and the marks `RefusingKind`, `KindFallsBack`, `KindRefusalsOf`, `KindOutcome`, `OneKind`. A kind given as a union is a compile error. `@alxia/openapi` documents each kind's statuses on the routes that kind may refuse.
