# @alxia/core documentation

The [package README](../README.md) is the short version. This folder is
the long one: a guide page per area, with the options, defaults, errors and
a realistic example for each.

## Guide

| Page | Read it when |
| --- | --- |
| [Getting started](guide/getting-started.md) | writing a first app, and testing it without a server |
| [Routes and schemas](guide/routes.md) | declaring paths, validating params, query, headers, cookies or a body, or reading a 400 |
| [Replies](guide/replies.md) | answering with a status, a file, a header, a cookie or a redirect, or turning an error into a response |
| [Hooks](guide/hooks.md) | authenticating, adding to the context, timing or tracing a request, or editing every response |
| [Groups and plugins](guide/groups-and-plugins.md) | scoping hooks to some routes, splitting the app across files, or writing a plugin |
| [Static files](guide/static-files.md) | serving a directory, one file, a single-page app, or a Bun HTML bundle |
| [Server-sent events](guide/server-sent-events.md) | streaming typed events to a client |
| [WebSockets](guide/websockets.md) | opening typed sockets, validated both ways |
| [Serving](guide/serving.md) | choosing a port or TLS, running behind a proxy, testing through `fetch`, or stopping cleanly |
| [The app's type](guide/types.md) | typing a client, a service or a type test from `typeof app` |
| [Troubleshooting](troubleshooting.md) | something went wrong and you have the message |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |
