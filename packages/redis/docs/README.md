# @alxia/redis documentation

The [package README](../README.md) is the short version. This folder is
the long one: a guide page per area, with the options, defaults, errors and
a realistic example for each.

## Guide

| Page | Read it when |
| --- | --- |
| [Connecting](guide/connecting.md) | opening the client every export takes, deciding when to build what takes it, failing fast when Redis is down, closing it, naming keys so features never share them, or giving every export one `@nxgt/redis` handle: a prefix on every key, a health check, closing on stop |
| [Rate limits](guide/rate-limits.md) | sharing an `@alxia/rate-limit` count across processes, understanding why GCRA lets a burst through, choosing `name`, or resetting a key |
| [Response cache](guide/response-cache.md) | sharing `@alxia/cache` responses across processes, invalidating them everywhere, or knowing what is stored in Redis |
| [Idempotency](guide/idempotency.md) | making a `POST` run once per `Idempotency-Key`, reading the `409`, `422` and `400`, scoping keys by user, or ordering it with a rate limit or an auth check |
| [Caches and locks](guide/caches-and-locks.md) | reading typed caches and a lock from the context, catching `LOCK_HELD`, or using `redis()` beside `@alxia/cache` |
| [Testing](guide/testing.md) | writing specs against a real Redis, giving `app.request()` a client address, or checking which routes the refusals reach |
| [Troubleshooting](troubleshooting.md) | something went wrong and you have the message, or a limit, a cache or a replay does not behave as you expected |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |
