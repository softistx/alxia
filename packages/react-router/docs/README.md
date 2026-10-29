# @alxia/react-router documentation

The [package README](../README.md) is the short version. This folder is
the long one: the setup, the Vite plugin and its default server, the build for Bun,
customising the server, the typed context, the client's files, making the app
installable and usable offline, wording an API's refusals, the BFF session, a GraphQL subscription relayed to the browser (`/subscription`), and what to do with each message.

| Page | Read it when |
| --- | --- |
| [Getting started](guide/getting-started.md) | starting a new app with `bun create @alxia --template react-router`, adding alxia to the official template or an existing app, or revealing the default server with `bunx alxia-react-router reveal` |
| [How it works](guide/how-it-works.md) | what happens in dev, in a build and under `vite preview` (and what prerendering serves), and what the plugin sets so the server is built for Bun |
| [Customising the server](guide/customising-the-server.md) | changing the default server with `createServer()`, or leaving it: another entry, overriding the wiring, a server of your own |
| [Typing the loaders](guide/typing-the-loaders.md) | typing the loaders with `Register` or a type argument, and the app's own context keys |
| [A CSP nonce](guide/csp-nonce.md) | a Content-Security-Policy without `'unsafe-inline'`: giving the inline scripts React Router renders a per-request nonce |
| [The document](guide/document.md) | rendering the page's CSP nonce in the root: `DocumentNonce` and `useNonce()`, an `InlineScript` for a theme's boot script with no flash, `CspNonceMeta`, the page's language and text direction (`@alxia/react-router/document`) |
| [Beside the pages](guide/beside-the-pages.md) | the middlewares that run around the pages, routes beside them, WebSockets in dev, in preview and in the build, and the client's files |
| [OpenAPI](guide/openapi.md) | writing the API of an app that serves pages spec first: binding its routes to the generated operations, and checking them with `matchesSpec` |
| [Testing](guide/testing.md) | making the app in process with `server.create(wiring)` from a build, and testing it without a server |
| [Deploying](guide/deploying.md) | running the build with `bun build/server/index.js`, and the Docker image |
| [Installable and offline](guide/pwa.md) | making the app installable and usable offline: the subpaths of `@alxia/react-router/pwa`, the service worker (`startWorker`, `/pwa/worker`), its build by `alxia()` or `buildWorker` (`/pwa/build`), its contract and cache names, which requests the worker caches and which responses it stores, the precache list read from a build, or clearing the caches at sign-out |
| [An API's refusals](guide/errors.md) | wording a GraphQL API's refusals for the pages: recognising an `ApiError`, the request id, the page a request is for, the catalogue store, the form checks in the API's words, the provider, and the loaders, the error page and the actions that answer with it, the JSON actions with their CSRF check and fetcher hook, calling the API from a loader (`apiCallFailure`), and keeping the catalogue fresh (`@alxia/react-router/errors`) |
| [A BFF session](guide/session.md) | redirecting after sign-in to a page of the site and nowhere else, the sign-in pages' paths, the session's cookies, the sign-in flow (where an answer lands, a refused code, the viewer, sign-out; `@alxia/react-router/session`), the pages a mail's link opens (a magic link, a password reset: `authLinks`), the page's hooks (sign-out, a mail link's parameter, a one-code field; `@alxia/react-router/session/react`), the step-up route's signed-out handling (`onSignedOut`), and the step-up's state and the props it gives the UI (`@alxia/react-router/session/model`) |
| [Links through React Router](guide/link.md) | `RouterLink`, React Router's `Link` as the link component of a UI library that hands `href` and spreads anchor props; `@alxia/react-router/link` |
| [A fetcher's fresh answer](guide/fetcher.md) | `useFetcherAnswer`, a handler called once per new answer of a keyed fetcher, not for the data it held at mount; `@alxia/react-router/fetcher` |
| [Lists whose state is the URL](guide/lists.md) | a search and filters in the address bar that drop the cursor (`useSearchChange`), a skeleton while the same page reloads (`useSameRouteLoading`), and a load-more button that appends pages by cursor and keeps the rows when one fails (`usePagedRows`); `@alxia/react-router/lists` |
| [Subscriptions for a BFF](guide/subscriptions.md) | showing a GraphQL subscription in the browser without giving it the API's token or a way to write a document: a resource route with a map of operation names to the server's documents, the same-site check, the bearer from the session, extra upstream headers, a heartbeat, abort propagation, size limits and a 429 passed through with `retryAfter` (`@alxia/react-router/subscription`) |
| [Troubleshooting](troubleshooting.md) | something went wrong and you have the message, or a page streams, hydrates or reads its context unlike you expected |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |

## Recipes

A task that crosses packages, in [the repository's recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md), each with a complete example:

- [Deploy with Docker](https://github.com/softistx/alxia/blob/develop/docs/recipes/deploying.md): the build stage, the final image, `NODE_ENV=production`
- [Health checks and graceful shutdown](https://github.com/softistx/alxia/blob/develop/docs/recipes/health-and-shutdown.md): probes, the drain, Docker and Kubernetes
