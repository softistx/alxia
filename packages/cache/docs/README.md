# @alxia/cache documentation

The [package README](../README.md) is the short version. This folder is
the long one: a guide page per area, with the options, defaults, errors and
a realistic example for each.

## Guide

| Page | Read it when |
| --- | --- |
| [Caching responses](guide/caching.md) | adding the cache, choosing `ttl` and `staleWhileRevalidate`, knowing which responses are kept, reading `X-Cache` and `ETag`, or tagging and skipping from a route |
| [Keys and Vary](guide/keys-and-vary.md) | caching a response that differs by language or another header, writing a `key` of your own, keying or tagging by what an earlier middleware added, or keeping personal responses out |
| [Invalidation](guide/invalidation.md) | emptying the cache after a write, by path or by tag, across several caches or several processes |
| [Stores](guide/stores.md) | sizing the memory store, sharing responses in Redis, or writing and testing a store of your own |
| [Troubleshooting](troubleshooting.md) | something went wrong and you have the message, or the cache does not hit when you expected it to |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |

## Recipes

A task that crosses packages, in [the repository's recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md), each with a complete example:

- [Caching and rate limiting with Redis](https://github.com/softistx/alxia/blob/develop/docs/recipes/caching-and-rate-limiting.md): a limit and a response cache shared by every process
