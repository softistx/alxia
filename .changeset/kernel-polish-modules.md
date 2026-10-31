---
"@alxia/modules": minor
---

`ModuleGraphError` gains a namespaced `code` (`modules.duplicate-module`, `modules.unknown-dependency`, `modules.dependency-cycle`, `modules.duplicate-declaration`). `permissionsOf` now throws for a permission two modules declare instead of de-duplicating it, the new `emitsOf` does the same for an emitted event type, and `resolveModules` runs both checks.
