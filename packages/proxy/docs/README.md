# @alxia/proxy documentation

The [package README](../README.md) is the short version. This folder is
the long one: a guide page per area, with the options, defaults, errors and
a realistic example for each.

## Guide

| Page | Read it when |
| --- | --- |
| [The basics](guide/basics.md) | forwarding a path to an upstream, stripping a prefix, ordering routes and the proxy, streaming, or typing what a callback reads |
| [Headers](guide/headers.md) | adding, removing or computing a header on either side, setting `Host`, or forwarding the client's address and scheme |
| [Mounting a prefix](guide/mounting.md) | giving a whole prefix to another app, and having its redirects and cookies come back under it |
| [Failures](guide/failures.md) | a 502, a 504, a 413 or a 400, a client that leaves, a shutdown, or the timeout and the body limit |
| [WebSockets](guide/websockets.md) | relaying a socket route to an upstream socket, close codes, subprotocols, backpressure and `maxBuffered` |
| [Security](guide/security.md) | being sure the proxy cannot be pointed elsewhere, trusting forwarded headers, or keeping credentials and internals from crossing |
| [Troubleshooting](troubleshooting.md) | something went wrong and you have the message, or a request does not reach the upstream |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |

## Recipes

A task that crosses packages, in [the repository's recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md), each with a complete example:

- [Put an app in front of other services](https://github.com/softistx/alxia/blob/develop/docs/recipes/proxy.md): auth, rate limit and a proxy to the services behind them
