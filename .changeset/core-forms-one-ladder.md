---
"@alxia/core": patch
---

The middleware forms of a route method, `ws`, `route(operation)` and `use` are laid out by one ladder of overloads (`ladder.ts`) from the slots each form names (`forms.ts`), instead of six ladders written out by hand, so they cannot drift apart. The exported names (`MiddlewareForms`, `OptionsForms`, `SocketForms`, `SocketOptionsForms`, `OperationForms`, `UseForms`) are kept. Internally, the call of a middleware is split from `chain-middleware.ts` by role.
