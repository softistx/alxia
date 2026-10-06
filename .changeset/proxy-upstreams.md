---
'@alxia/proxy': minor
---

Several upstreams behind one proxy. `proxy()`, `proxy.mount()` and `proxy.ws()` take a list of targets where they took one, each checked as a single target is, and send each request to the next, round-robin. A request goes on to another upstream only when the one it tried provably never received it: a refused connection (`ConnectionRefused`, `ECONNREFUSED`) or a host that does not resolve (`ENOTFOUND`, `EAI_AGAIN`), and, for a request with a body, before the upstream read any of it. A reset, a timeout or any answer is never retried. `retries` caps the upstreams one request tries (the number of upstreams − 1 by default, each tried at most once), and `cooldown` (5 000 ms by default) skips an upstream whose connect failed; when every one is cooling down, the one that failed longest ago is tried rather than none. A socket route retries its connect the same way, before the client's `101`. New types: `ProxyTarget`, `ProxyTargets`.
