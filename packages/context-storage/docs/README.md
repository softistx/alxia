# @alxia/context-storage documentation

The [package README](../README.md) is the short version. This folder is
the long one: what the middleware stores and when, how to read it from a
service, a repository or a logger, how its type follows the app, where it
sits among an app's middlewares, and what a timer or a detached callback sees.

| Page | Read it when |
| --- | --- |
| [Guide](guide.md) | reading the request's context from code the handler calls, typing it, placing the middleware among the others, running a job or a test with a context, or wondering what a timer sees |
| [Troubleshooting](troubleshooting.md) | `getContext()` threw a `ContextStorageError`, a service read the wrong context or none, `use(contextStorage)` threw a `TypeError`, or `tsc` refused the middleware or its type |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |
