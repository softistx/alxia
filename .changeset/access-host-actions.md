---
'@alxia/access': minor
---

Let a host declare actions beyond `read` and `manage`: `createAccess` takes `actions: ['receive']`, so a module can declare `orders:receive`. The `Permission` type is now `<area>:<action>`, `isPermission` takes the extra actions, and an undeclared action is still an `access.invalid-permission` boot error.
