# @alxia/graphql documentation

The [package README](../README.md) is the short version. This folder is
the long one: a guide page per area, with the options, defaults, errors and
a realistic example for each.

## Guide

| Page | Read it when |
| --- | --- |
| [Mounting the endpoint](guide/endpoint.md) | adding GraphQL to an app, choosing its path under a prefix, putting it behind a guard, reading what it answers, telling GraphQL errors from the problem details of the HTTP layer around it, adding `health()` probes and draining it on `SIGTERM`, or its first spec |
| [The typed context](guide/context.md) | typing a schema with the app's context, reading `user` or a database handle in a resolver, setting a cookie, adding per-request loaders, or reading the `missing …` compile error |
| [Yoga's plugins and options](guide/yoga.md) | adding Yoga or Envelop plugins, exposing or masking errors, batching, serving subscriptions, or calling the endpoint from another origin |
| [GraphQL over WebSocket](guide/websockets.md) | serving Apollo Client's, urql's or `graphql-ws`'s WebSocket clients with `ws: true`, guarding the upgrade, reading `connectionParams`, the subprotocol, closing the sockets on shutdown, or testing a subscription over a socket |
| [Harden it for production](guide/production.md) | putting a GraphQL API on the internet: rate limiting the endpoint, depth limits, introspection off outside development, masked errors and the errors a client may read, a body limit, CSRF for a cookie session, persisted operations |
| [GraphiQL and Apollo Sandbox](guide/ide.md) | choosing the IDE a browser gets, configuring it, keeping it working under a strict `Content-Security-Policy`, or serving it outside dev with `ide: 'graphiql'` |
| [Testing the endpoint](guide/testing.md) | testing a GraphQL app without a server: `graphqlClient`, an auth header, a custom path, a typed document, the HTTP status of a 400 or a 413 |
| [Troubleshooting](troubleshooting.md) | something went wrong and you have the message |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |

## Recipes

A task that crosses packages, in [the repository's recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md), each with a complete example:

- [A GraphQL API](https://github.com/softistx/alxia/blob/develop/docs/recipes/graphql-api.md): typed resolvers, a viewer, subscriptions, GraphiQL, auth errors and the drain
- [Authenticate requests](https://github.com/softistx/alxia/blob/develop/docs/recipes/authentication.md): a bearer token or a cookie session, a role check, the user typed in every handler
- [Test an alxia app](https://github.com/softistx/alxia/blob/develop/docs/recipes/testing.md): `app.request`, a middleware alone, the typed client, sockets, Redis
- [Health checks and graceful shutdown](https://github.com/softistx/alxia/blob/develop/docs/recipes/health-and-shutdown.md): probes, the drain, Docker and Kubernetes
- [Deploy with Docker](https://github.com/softistx/alxia/blob/develop/docs/recipes/deploying.md): the build stage, the final image, `NODE_ENV=production`
