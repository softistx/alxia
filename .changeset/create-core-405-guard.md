---
'@alxia/create': patch
---

New projects install an `@alxia/core` whose guarded group refuses the 405 at its routes, so its `Allow` never tells an anonymous client what the guard keeps.
