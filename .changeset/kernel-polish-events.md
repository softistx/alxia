---
"@alxia/events": minor
---

`EventsError` codes are namespaced `events.` (`events.undeclared-type`, `events.missing-queue`, ...). `events.duplicate-emit` is gone: an event type two modules emit is `@alxia/modules`' `ModuleGraphError` (`modules.duplicate-declaration`). README API table completed. `EventsQueueOptions.backoff` is now typed `Duration` (`"5s"`, `"1m"`, ...) instead of `string`.
