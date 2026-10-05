# @alxia/rate-limit documentation

The [package README](../README.md) is the short version. This folder is
the long one: the options, defaults and behaviours with an example each,
the errors you may meet, and what is coming.

| Page | Read it when |
| --- | --- |
| [Guide](guide.md) | choosing what to count and where, reading the 429 on the wire, keeping counts across processes, or testing a limit |
| [Troubleshooting](troubleshooting.md) | something went wrong and you have the message, or a limit does not count as you expected |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |

## Recipes

A task that crosses packages, in [the repository's recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md), each with a complete example:

- [Caching and rate limiting with Redis](https://github.com/softistx/alxia/blob/develop/docs/recipes/caching-and-rate-limiting.md): a limit and a response cache shared by every process
