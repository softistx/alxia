# @alxia/react-router documentation

The [package README](../README.md) is the short version. This folder is
the long one: the setup, the Vite plugin and its default server, the build for Bun,
customising the server, the typed context, the client's files, and what to
do with each message.

| Page | Read it when |
| --- | --- |
| [Guide](guide.md) | starting a new app with `bun create @alxia --template react-router`, adding alxia to the official template or an existing app, revealing the default server with `bunx alxia-react-router reveal`, customising the server with `createServer()`, typing the loaders with `Register` or a type argument, the app's own context keys, what `vite preview` and prerendering serve, what the plugin sets so the server is built for Bun, the escape hatches (another entry, overriding the wiring, a server of your own), what runs around the pages, WebSockets in dev, in preview and in the build, the client's files, OpenAPI, testing, or deploying, with the Docker image |
| [Troubleshooting](troubleshooting.md) | something went wrong and you have the message, or a page streams, hydrates or reads its context unlike you expected |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |

## Recipes

A task that crosses packages, in [the repository's recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md), each with a complete example:

- [Deploy with Docker](https://github.com/softistx/alxia/blob/develop/docs/recipes/deploying.md): the build stage, the final image, `NODE_ENV=production`
- [Health checks and graceful shutdown](https://github.com/softistx/alxia/blob/develop/docs/recipes/health-and-shutdown.md): probes, the drain, Docker and Kubernetes
