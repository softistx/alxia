# @alxia/react-router documentation

The [package README](../README.md) is the short version. This folder is
the long one: the setup, the Vite plugin and its default server, the build for Bun,
customising the server, the typed context, the client's files, making the app
installable and usable offline, wording an API's refusals, and what to do with each message.

| Page | Read it when |
| --- | --- |
| [Getting started](guide/getting-started.md) | starting a new app with `bun create @alxia --template react-router`, adding alxia to the official template or an existing app, or revealing the default server with `bunx alxia-react-router reveal` |
| [How it works](guide/how-it-works.md) | what happens in dev, in a build and under `vite preview` (and what prerendering serves), and what the plugin sets so the server is built for Bun |
| [Customising the server](guide/customising-the-server.md) | changing the default server with `createServer()`, or leaving it: another entry, overriding the wiring, a server of your own |
| [Typing the loaders](guide/typing-the-loaders.md) | typing the loaders with `Register` or a type argument, and the app's own context keys |
| [A CSP nonce](guide/csp-nonce.md) | a Content-Security-Policy without `'unsafe-inline'`: giving the inline scripts React Router renders a per-request nonce |
| [Beside the pages](guide/beside-the-pages.md) | the middlewares that run around the pages, routes beside them, WebSockets in dev, in preview and in the build, and the client's files |
| [OpenAPI](guide/openapi.md) | writing the API of an app that serves pages spec first: binding its routes to the generated operations, and checking them with `matchesSpec` |
| [Testing](guide/testing.md) | making the app in process with `server.create(wiring)` from a build, and testing it without a server |
| [Deploying](guide/deploying.md) | running the build with `bun build/server/index.js`, and the Docker image |
| [Installable and offline](guide/pwa.md) | making the app installable and usable offline: the subpaths of `@alxia/react-router/pwa`, the service worker's contract and cache names, which requests the worker caches and which responses it stores, the precache list read from a build, or clearing the caches at sign-out |
| [An API's refusals](guide/errors.md) | wording a GraphQL API's refusals for the pages: recognising an `ApiError`, the request id, the page a request is for, the catalogue store, the form checks in the API's words, the provider, and the loaders, the error page and the actions that answer with it, the JSON actions with their CSRF check and fetcher hook, calling the API from a loader (`apiCallFailure`), and keeping the catalogue fresh (`@alxia/react-router/errors`) |
| [Troubleshooting](troubleshooting.md) | something went wrong and you have the message, or a page streams, hydrates or reads its context unlike you expected |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |

## Recipes

A task that crosses packages, in [the repository's recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md), each with a complete example:

- [Deploy with Docker](https://github.com/softistx/alxia/blob/develop/docs/recipes/deploying.md): the build stage, the final image, `NODE_ENV=production`
- [Health checks and graceful shutdown](https://github.com/softistx/alxia/blob/develop/docs/recipes/health-and-shutdown.md): probes, the drain, Docker and Kubernetes
