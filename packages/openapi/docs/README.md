# @alxia/openapi documentation

The [package README](../README.md) is the short version. This folder is
the long one: the spec-first workflow end to end, how the checks match an
operation to a route, and what to do with each message the checks and the
generator print.

| Page | Read it when |
| --- | --- |
| [Spec first](guide/spec-first.md) | starting an API from its OpenAPI document: configuring `@nxgt/openapi-codegen`, declaring alxia's 400, binding the generated operations with middlewares, committing the generated files, checking them in CI, and generating a client from the same document |
| [API docs](guide/api-docs.md) | serving an interactive page and the document from the app, choosing Scalar or Swagger UI, turning it off in production, using it with `secureHeaders`, or running it beside a GraphQL endpoint |
| [The checks](guide/checks.md) | calling `implemented` or `matchesSpec` in a test or at startup, checking an app with a prefix or routes with middlewares, or choosing what `matchesSpec` leaves out |
| [Troubleshooting](troubleshooting.md) | a check threw, the generator refused the document or left an operation out, or an import from an older version no longer compiles |
| [Roadmap](roadmap.md) | wondering what is coming, what is not planned, and what this package was called before |
