---
"@alxia/core": minor
---

`route(operation, ...middlewares, handler)` takes the middlewares of any route, up to 8. The operation's `schema` is read as two of them: a `responds` of its responses, first, which checks every reply with a status it declares, a middleware's included, and a `validate` of its request parts just before the handler, so an `auth` placed before it answers 401 before the body is read. `validate(operation)` validates an operation's request parts; placed among the route's middlewares, it validates there, and the route runs no other (any `validate` of each part by the operation's own schema counts). A body is now read once per request: a second `validate` of it checks what the first read, where it failed with `Body already used`. `route(operation, [hooks], handler)`, the list of 0.3, keeps working, deprecated. New types: `OperationForms`, `OperationApp`, `OperationParts`, `OperationOptions`, `OperationResponds`, `OperationValidate`.
