# Recipes

One page per task. Each states the problem, gives one complete example that
runs, and links to the reference pages. The examples are files of a project
of their own, type-checked and, where they have a spec, run by
`bun run check:doc-snippets`, so they stay true. New here? Start with
[Start in 5 minutes](../start.md).

| I want to… | Recipe | Packages |
| --- | --- | --- |
| sign users in, guard routes, check a role, keep a session | [Authenticate requests](authentication.md) | `core`, `jwt`, `janus` |
| write the contract first and get routes, a test, a client and docs from it | [A spec-first CRUD API](spec-first-crud.md) | `core`, `openapi`, `env` |
| serve GraphQL with typed resolvers, a viewer, subscriptions and GraphiQL | [A GraphQL API](graphql-api.md) | `core`, `graphql`, `jwt` |
| take a file, validate it, cap the request, store it | [File uploads](file-uploads.md) | `core` |
| push events to a client, or talk both ways | [SSE and WebSockets](sse-and-websockets.md) | `core` |
| test routes, middlewares, sockets and Redis | [Test an alxia app](testing.md) | `core`, `openapi`, `redis` |
| answer every error in one format, keep the 500s private | [Answer errors consistently](errors.md) | `core` |
| tell a supervisor I am alive, ready, and stopping | [Health checks and graceful shutdown](health-and-shutdown.md) | `core` |
| share a rate limit and a response cache between processes | [Caching and rate limiting with Redis](caching-and-rate-limiting.md) | `rate-limit`, `cache`, `redis` |
| ship a small image that stops cleanly | [Deploy with Docker](deploying.md) | `create` |

Each recipe's code is also meant to be copied whole: a file starts with its
path (`// file: src/app.ts`), and the files of a recipe import one another as
the files of an app do.

## The conventions of a recipe

- **A fence that starts with `// file: <path>`** is a file of the recipe's
  project (`# file:` in YAML), type-checked together with the others.
- **`ts excerpt`** is a part of a file shown elsewhere, or of a template: each
  of its lines is found there, so it cannot drift.
- **`ts no-check`** is for what is not a program: an output, a signature, a
  client-side line.
- The check is `bun run check:doc-snippets [docs/recipes/testing.md …]`, after
  `bun run build`, and a Redis for the recipes that use one
  (`REDIS_URL=redis://localhost:6379`).
