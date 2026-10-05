---
'@alxia/proxy': patch
---

Documents `app.all('/api/*', proxy(url))`, the proxy as one route for every method at its path, with core's new `all`: when to use it rather than `use('/api', proxy(url))`, which shadows the routes declared after it under its path, and what a local path under it answers.
