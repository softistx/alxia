---
"@alxia/core": patch
---

The middleware forms of a route method, `ws`, `route(operation)` and `use` are laid out by one ladder of overloads (`ladder.ts`) from the slots each form names (`forms.ts`), instead of six ladders written out by hand, so they cannot drift apart. The forms, their 8-middleware cap, what each middleware reads and the errors TypeScript 6 and 7 report are unchanged; the exported names (`MiddlewareForms`, `OptionsForms`, `SocketForms`, `SocketOptionsForms`, `OperationForms`, `UseForms`) are kept. `Alxia`'s third parameter, `Shortcuts`, is kept, defaulted to `never`, and documented as deprecated: no handler reads it, only `use`, `derive` and the deprecated `onRefusal` and `bodyLimit` write it, and it goes with the deprecated adapters in the next minor. Internally, the call of a middleware is split from `chain-middleware.ts` by role.
