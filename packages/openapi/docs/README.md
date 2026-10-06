# @alxia/openapi documentation

The [package README](../README.md) is the short version. This folder is
the long one: the spec-first workflow end to end, how the checks match an
operation to a route, and what to do with each message the checks and the
generator print.

| Page | Read it when |
| --- | --- |
| [Spec first](guide/spec-first.md) | starting an API from its OpenAPI document: configuring `@nxgt/openapi-codegen`, declaring alxia's 400, binding the generated operations with middlewares, committing the generated files, checking them in CI, and generating a client from the same document |
| [Testing with the generated client](guide/testing.md) | calling the app in a test through `@nxgt/openapi-httpyz` and `app.fetch`, with no server, every call typed by the spec, and keeping `app.request` for requests the spec forbids |
| [API docs](guide/api-docs.md) | serving an interactive page and the document from the app, choosing Scalar or Swagger UI, turning it off in production, using it with `secureHeaders`, or running it beside a GraphQL endpoint |
| [The checks](guide/checks.md) | calling `implemented` or `matchesSpec` in a test or at startup, checking an app with routes with middlewares, or choosing what `matchesSpec` leaves out |
| [How routes are matched](guide/matching.md) | understanding how the checks match operations to routes: the path's shape, prefixes, and special cases |
| [Troubleshooting](troubleshooting.md) | a check threw, the generator refused the document or left an operation out, or an import from an older version no longer compiles |
| [Roadmap](roadmap.md) | wondering what is coming, what is not planned, and what this package was called before |

## Recipes

A task that crosses packages, in [the repository's recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md), each with a complete example:

- [A spec-first CRUD API](https://github.com/softistx/alxia/blob/develop/docs/recipes/spec-first-crud.md): `openapi.yaml` to routes, `matchesSpec`, a typed test client and `apiDocs`
- [Test an alxia app](https://github.com/softistx/alxia/blob/develop/docs/recipes/testing.md): `app.request`, a middleware alone, the typed client, sockets, Redis
- [Answer errors consistently](https://github.com/softistx/alxia/blob/develop/docs/recipes/errors.md): problem details, `HttpError`, a `try`/`catch` middleware
