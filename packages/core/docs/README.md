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
| [Middleware: which way to use](guide/middleware.md) | writing a middleware, inline or shared with `defineMiddleware`, choosing between a route's middlewares, `use(...middlewares)` and `use(path, …)` for every request, `derive`, a group or a plugin, observing every response with `settle`, answering an error or a refusal with a `try`/`catch` and `refusalOf`, or reading the order a request runs them in, `validate` and `responds` included |
| [Hooks](guide/hooks.md) | adding to the context with `derive` and `decorate`, reading a request's cookies, running code at `onStart` and `onStop`, or adding a body `parser` |
| [Groups and plugins](guide/groups-and-plugins.md) | splitting the app across files with `defineRoutes`, building several apps — a spec's, a variant — on one base with `fork()`, scoping middlewares to some routes, or reading what `plugin` mounts |
| [Writing a plugin](guide/writing-a-plugin.md) | writing a plugin: an app, a `Plugin` function, or a `definePlugin` that reads what an earlier plugin added, or a middleware factory that reads the context |
| [Static files](guide/static-files.md) | serving a directory, one file, a single-page app, or a Bun HTML bundle |
| [Server-sent events](guide/server-sent-events.md) | streaming typed events to a client |
| [WebSockets](guide/websockets.md) | opening typed sockets, their upgrade run through middlewares, their messages validated both ways |
| [Errors and problem details](guide/errors.md) | answering errors as RFC 9457 problems with `alxia({ errors: 'problem' })`, giving an `HttpError` its `type`, `detail` and extensions, answering a middleware's own error in the app's format with `errorFormat` and `problemOf`, or declaring `Problem` in the OpenAPI document |
| [Health and shutdown](guide/health-and-shutdown.md) | adding liveness and readiness probes with `health()`, or running under Kubernetes or a platform that sends `SIGTERM`: the graceful shutdown, `shutdownTimeout`, `shutdownSignal` |
| [Development](guide/development.md) | running the app on your machine: the dev switch `alxia({ dev })`, the route table `listen` prints and `onListen`, the hint of a 404, the dev error page of a 500, a factory given uncalled, `markFactory`, and `compose` past 8 middlewares |
| [Serving](guide/serving.md) | choosing a port or TLS, running behind a proxy (`forwardedIp`, `trustProxy`, `originalUrl`, refusing an untrusted peer), testing through `fetch`, serving the sockets from a `Bun.serve` of your own with `websocket`, or stopping cleanly |
| [The app's type](guide/types.md) | typing a service or a type test from `typeof app`: `ContextOf`, `Register` and `AppContext`, and what a route checks |
| [Upgrading](upgrading.md) | moving to the next release: what changed, before and after, what can break, the peers of 0.6 to 0.9, `trustProxy` and `originalUrl`, `fork()`, the socket `upgrade` handler, the GraphQL 413, `forwardedIp`, `matchesSpec`'s `strict`, and each form 0.5 removed — the request hooks, a list of hooks, `use(plugin)`, … — as its replacement |
| [Troubleshooting](troubleshooting.md) | something went wrong and you have the message |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |

## Recipes

A task that crosses packages, in [the repository's recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md), each with a complete example:

- [Start in 5 minutes](https://github.com/softistx/alxia/blob/develop/docs/start.md): a first app, from `bun create @alxia` to Docker
- [Authenticate requests](https://github.com/softistx/alxia/blob/develop/docs/recipes/authentication.md): a bearer token or a cookie session, a role check, the user typed in every handler
- [A spec-first CRUD API](https://github.com/softistx/alxia/blob/develop/docs/recipes/spec-first-crud.md): `openapi.yaml` to routes, `matchesSpec`, a typed test client and `apiDocs`
- [A GraphQL API](https://github.com/softistx/alxia/blob/develop/docs/recipes/graphql-api.md): typed resolvers, a viewer, subscriptions, GraphiQL, auth errors and the drain
- [File uploads](https://github.com/softistx/alxia/blob/develop/docs/recipes/file-uploads.md): multipart through `validate`, body limits, a stored file
- [SSE and WebSockets](https://github.com/softistx/alxia/blob/develop/docs/recipes/sse-and-websockets.md): typed events and sockets, authenticated on the upgrade
- [Test an alxia app](https://github.com/softistx/alxia/blob/develop/docs/recipes/testing.md): `app.request`, a middleware alone, the typed client, sockets, Redis
- [Answer errors consistently](https://github.com/softistx/alxia/blob/develop/docs/recipes/errors.md): problem details, `HttpError`, a `try`/`catch` middleware
- [Health checks and graceful shutdown](https://github.com/softistx/alxia/blob/develop/docs/recipes/health-and-shutdown.md): probes, the drain, Docker and Kubernetes
- [Caching and rate limiting with Redis](https://github.com/softistx/alxia/blob/develop/docs/recipes/caching-and-rate-limiting.md): a limit and a response cache shared by every process
- [Deploy with Docker](https://github.com/softistx/alxia/blob/develop/docs/recipes/deploying.md): the build stage, the final image, `NODE_ENV=production`
