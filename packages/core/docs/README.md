# @alxia/core documentation

The [package README](../README.md) is the short version. This folder is
the long one: a guide page per area, with the options, defaults, errors and
a realistic example for each.

## Guide

| Page | Read it when |
| --- | --- |
| [Getting started](guide/getting-started.md) | writing a first app, and testing it without a server |
| [Routes and validation](guide/routes.md) | declaring paths and a route's options, validating params, query, headers, cookies or a body with `validate`, declaring replies with `responds`, capping a body's size, reading a 400 or a 413, or answering a refusal in your own format with `refusalOf` |
| [Replies](guide/replies.md) | answering with a status, a file, a header, a cookie, a redirect or an RFC 9457 problem, or turning an error into a response |
| [Middleware: which way to use](guide/middleware.md) | writing a middleware with `defineMiddleware`, choosing between a route's middlewares, `use(...middlewares)` and `use(path, …)` for every request, `derive`, a group or a plugin, observing every response with `settle`, replacing `onRequest`, `onResponse`, `around`, `wrap`, `onError` or `onRefusal`, or reading the order a request runs them in, `validate` and `responds` included |
| [Hooks](guide/hooks.md) | authenticating or adding to the context with `derive` and `decorate`, reading a request's cookies, or what the deprecated request hooks do |
| [Groups and plugins](guide/groups-and-plugins.md) | splitting the app across files with `defineRoutes`, scoping middlewares to some routes, or reading what `plugin` mounts |
| [Writing a plugin](guide/writing-a-plugin.md) | writing a plugin: an app, a `Plugin` function, or a `definePlugin` that reads what an earlier plugin added, or a middleware factory that reads the context |
| [Static files](guide/static-files.md) | serving a directory, one file, a single-page app, or a Bun HTML bundle |
| [Server-sent events](guide/server-sent-events.md) | streaming typed events to a client |
| [WebSockets](guide/websockets.md) | opening typed sockets, their upgrade run through middlewares, their messages validated both ways |
| [Serving](guide/serving.md) | choosing a port or TLS, running behind a proxy, testing through `fetch`, serving the sockets from a `Bun.serve` of your own with `websocket`, or stopping cleanly |
| [The app's type](guide/types.md) | typing a service or a type test from `typeof app`: `ContextOf`, `Register` and `AppContext`, and what a route checks |
| [Upgrading](upgrading.md) | moving to the next release: what changed, before and after, what can break, and each request hook as a middleware |
| [Troubleshooting](troubleshooting.md) | something went wrong and you have the message |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |
