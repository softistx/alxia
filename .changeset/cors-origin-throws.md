---
'@alxia/cors': patch
---

An `origin` function that throws no longer turns a preflight into a 500: the throw is logged and the preflight is answered with its 204, without CORS headers, as a request already got the route's answer without them. A throw costs the headers, never the response.
