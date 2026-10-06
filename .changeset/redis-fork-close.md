---
"@alxia/redis": patch
---

`redis(handle)` closes the handle when the last fork serving it stops, not when the first does. Forks of one app share the plugin's `onStop`, so stopping one fork, or a fork that never listened, closed the client under a sibling still serving; it now counts the servers `onStart` is given and closes once none remains. A `stop()` before `listen` closes the handle only while no app serves it, so one app behaves as before. Needs `@alxia/core` 0.14, whose `onStop` is given the server that stopped.
