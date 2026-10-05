# @alxia/env documentation

The [package README](../README.md) is the short version. This folder is
the long one: `defineEnv`, how the environment is read, how each validator turns its
strings into typed values, defaults, the error at startup, and how to test
a module that reads the environment.

| Page | Read it when |
| --- | --- |
| [`defineEnv`](define-env.md) | declaring the variables with their own schemas, reading `ctx.env` through `Register`, using `env` in `@alxia/graphql`, keeping secrets out of logs, `.env` and Docker, or generating a `.env.example` |
| [Guide](guide.md) | writing the schema with Zod, Valibot or ArkType, coercing numbers, booleans and lists, choosing defaults, reading an `EnvError`, or testing with your own variables |
| [Troubleshooting](troubleshooting.md) | the process stopped with an `EnvError` or a `TypeError`, the `alxia-env` bin failed, a variable reads the wrong value, or `tsc` refused a call |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |

## Recipes

A task that crosses packages, in [the repository's recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md), each with a complete example:

- [Start in 5 minutes](https://github.com/softistx/alxia/blob/develop/docs/start.md): a first app, from `bun create @alxia` to Docker
- [Deploy with Docker](https://github.com/softistx/alxia/blob/develop/docs/recipes/deploying.md): the build stage, the final image, `NODE_ENV=production`
- [Test an alxia app](https://github.com/softistx/alxia/blob/develop/docs/recipes/testing.md): `app.request`, a middleware alone, the typed client, sockets, Redis
