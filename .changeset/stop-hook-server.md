---
"@alxia/core": minor
---

An `onStop` hook is given the server that stopped, the one `onStart` was given, or `undefined` on a `stop()` of an app that never listened, which runs the hooks too. A hook forks of one base share can now tell which app stopped and whether it had started, and release a shared resource when the last app serving stops. A hook that takes no argument runs as before; one annotated `(server: Bun.Server<unknown>) => …` must accept `undefined`.
