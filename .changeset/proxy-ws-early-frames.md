---
"@alxia/proxy": patch
---

`proxy.ws` no longer loses the frames an upstream sends the moment its socket opens. They could arrive before the relay listened, and were dropped or reordered; they are now held from the upstream's open and relayed first, in order.
