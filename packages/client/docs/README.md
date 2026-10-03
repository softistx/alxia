# @alxia/client documentation

The [package README](../README.md) is the short version. This folder is
the long one: a guide page per area, with the options, defaults, errors and
a realistic example for each.

## Guide

| Page | Read it when |
| --- | --- |
| [Calling routes](guide/calls.md) | creating the client, choosing its target, sending params, a query, headers, cookies or a body, adding a token to every call, or cancelling one |
| [Reading results](guide/results.md) | narrowing `data` by `status` or `ok`, reading a 400 or a 500, knowing why a date is a string, or reading a redirect |
| [Events and sockets](guide/events-and-sockets.md) | reading server-sent events, opening a typed WebSocket, sending headers or cookies with its upgrade, or finding out why a socket did not open |
| [Testing](guide/testing.md) | calling the app in process, testing a socket over HTTP, pinning the contract with type tests, or faking `fetch` |
| [Troubleshooting](troubleshooting.md) | something went wrong and you have the message |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |
