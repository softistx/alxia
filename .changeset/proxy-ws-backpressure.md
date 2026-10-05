---
"@alxia/proxy": minor
---

`proxy.ws` applies backpressure between its two sockets. A client that stops reading pauses the reads of the upstream socket until Bun's `drain` finds it caught up, so the upstream slows down instead of frames piling up in memory. A new `maxBuffered` option (1 MiB by default) caps the bytes queued for either side, the frames queued before the client's socket opens included: a frame for a side past it, or one Bun dropped, closes both with 1013, exported as `OVERLOADED_CLOSE`, rather than buffer without bound.
