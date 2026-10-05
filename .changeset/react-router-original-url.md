---
'@alxia/react-router': minor
---

Hand React Router its request at `originalUrl(ctx)`: behind a proxy the app trusts (`alxia({ proxy: trustProxy(…) })`), `request.url` in a loader or an action is the scheme and host the client asked for. `createServer({ proxy })` passes the option to the app it makes.
