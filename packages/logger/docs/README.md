# @alxia/logger documentation

The [package README](../README.md) is the short version. This folder is
the long one: every option and default, what each entry holds, and what
to do when the log or a response is not what you expected.

| Page | Read it when |
| --- | --- |
| [Guide](guide.md) | choosing where entries go, trusting or making request ids, reading `log` and `requestId` in a route, placing the middleware among the others, or testing what it logs |
| [Troubleshooting](troubleshooting.md) | something went wrong and you have the message, or a header or an entry is missing |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |

## Recipes

A task that crosses packages, in [the repository's recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md), each with a complete example:

- [Health checks and graceful shutdown](https://github.com/softistx/alxia/blob/develop/docs/recipes/health-and-shutdown.md): probes, the drain, Docker and Kubernetes
- [Answer errors consistently](https://github.com/softistx/alxia/blob/develop/docs/recipes/errors.md): problem details, `HttpError`, a `try`/`catch` middleware
