---
"@alxia/proxy": minor
---

`proxy.ws()` opens the upstream socket before the client is upgraded: the client's `101` names the subprotocol the upstream chose, and an upstream that cannot be reached answers a 502 (a 504 past `timeout`) over HTTP, in the app's error format, instead of a socket closed at once with 1014. A client gone during the connect closes the upstream. `BAD_GATEWAY_CLOSE` is deprecated: nothing sends it any more.
