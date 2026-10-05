# API docs

`apiDocs` serves the OpenAPI document and an interactive page for it. It is
a plugin: one line, no configuration, and nothing added to your
dependencies.

```ts
import { alxia } from '@alxia/core';
import { apiDocs } from '@alxia/openapi';

export const app = alxia().plugin(apiDocs({ spec: 'openapi.yaml' }));
```

| Route | Answers |
| --- | --- |
| `GET /docs` | the interactive page |
| `GET /docs/openapi.yaml` | the document |
| `GET /docs/openapi.json` | the same, as JSON |

It is for the REST side of an app, the document you wrote first
([Spec first](spec-first.md)). A GraphQL endpoint has its own explorer: see
[Beside a GraphQL endpoint](#beside-a-graphql-endpoint).

## The spec

`spec` is one of:

- a path to a YAML or JSON file, read once, when `apiDocs` is called. A
  relative path is looked up from the working directory of the process. The
  file is parsed with Bun's own YAML support (`Bun.YAML`), so there is no
  parser to install. A YAML file is served as written, comments included;
- the document as an object.

A file that is missing, does not parse, or has no `openapi` version throws a
`TypeError` at startup, naming `apiDocs()`, rather than serving a blank page
([troubleshooting](../troubleshooting.md#typeerror-apidocs-cannot-read-the-spec-)).

## Options

```ts
apiDocs({
	spec: 'openapi.yaml',
	path: '/reference', // default '/docs'; the files are at /reference/openapi.yaml and .json
	ui: 'swagger', // 'scalar' (default) or 'swagger'
	title: 'Todos API', // default: the document's info.title
	servers: [{ url: 'http://localhost:3000', description: 'local' }],
	enabled: process.env.NODE_ENV !== 'production', // default true
});
```

- **`path`** starts with `/` and does not end with one. In an app with a
  prefix, `alxia({ prefix: '/api' })`, the routes are under it, as any
  plugin's: `GET /api/docs`.
- **`ui`** is [Scalar](https://scalar.com) or
  [Swagger UI](https://swagger.io/tools/swagger-ui/).
- **`servers`** replaces the document's `servers`, in the page and in both
  files: the page's "Try it out" then calls the server you name, such as
  localhost in development.
- **`enabled: false`** mounts nothing and reads nothing, so the file may be
  absent. To keep the page out of production, give it the environment
  check above; to put it behind a login instead, mount it in a group after
  the middleware that guards it:

```ts
const app = alxia().group('/internal', (g) =>
	g.use(requireAdmin).plugin(apiDocs({ spec: 'openapi.yaml' })),
);
```

## Where the page's code comes from

The page is one small HTML file, and the interface loads from
`cdn.jsdelivr.net`: Scalar's `@scalar/api-reference` or `swagger-ui-dist`,
each at the exact version this release of the package was written for, with
a `sha384` integrity hash, so a changed file does not run. The browser needs
to reach the CDN; the server does not. Upgrading the interface is a release
of `@alxia/openapi`, not a surprise.

## With `secureHeaders`

`secureHeaders` gives a page that needs scripts a problem: its default
policy, `default-src 'none'`, blocks the CDN. `apiDocs` settles it on the
page: **the docs page sets its own `Content-Security-Policy`**, and
`secureHeaders` keeps a header a route set (as `@alxia/graphql`'s IDE does),
so the two work together with no option on either side, with or without
`nonce: true`:

```ts
import { secureHeaders } from '@alxia/secure-headers';

const app = alxia()
	.use(secureHeaders({ nonce: true }))
	.plugin(apiDocs({ spec: 'openapi.yaml' }));
// /docs: its own policy. Every other response: secureHeaders' policy, a nonce included.
```

The policy is written for this page and is fresh for each response: scripts
from `cdn.jsdelivr.net` and, for Swagger UI's one inline script, a nonce
the page makes itself; styles from the CDN and inline ones (both UIs inject
styles); images and fonts over `https:` and `data:`; `connect-src` to
`'self'`, `https:` and `http:` (the spec, and the servers "Try it out"
calls); no frames, no base URI, no forms. The policy of the rest of the app
is untouched, so the strict one keeps guarding your API.

## `matchesSpec` ignores the docs routes

The page and the files are not operations of the document, and
`matchesSpec` leaves them out by itself:

```ts
matchesSpec(app, operations); // the three docs routes are not listed
```

`isApiDocsRoute(route)` says whether `apiDocs` declared a route, for a check
of your own, and composes with `exclude`:

```ts
matchesSpec(app, operations, {
	exclude: (route) => isApiDocsRoute(route) || route.path === '/health',
});
```

## Beside a GraphQL endpoint

`apiDocs` is for the REST and OpenAPI side. A GraphQL API's explorer is
[Yoga's GraphiQL](https://github.com/softistx/alxia/tree/develop/packages/graphql/docs),
served by `@alxia/graphql` at the endpoint itself: open `/graphql` in a
browser. The two live in one app, behind the same middlewares:

```ts
import { alxia } from '@alxia/core';
import { graphql } from '@alxia/graphql';
import { apiDocs, matchesSpec } from '@alxia/openapi';
import { secureHeaders } from '@alxia/secure-headers';
import { createSchema } from 'graphql-yoga';
import { operations } from './generated/alxia';

const schema = createSchema({
	typeDefs: /* GraphQL */ `type Query { hello: String! }`,
	resolvers: { Query: { hello: () => 'world' } },
});

const dev = process.env.NODE_ENV !== 'production';

export const app = alxia()
	.use(secureHeaders())
	.route(operations.listTodos, ({ reply }) => reply.ok([])) // REST, from openapi.yaml
	.plugin((app) => graphql(app, { schema, ide: dev ? 'graphiql' : false })) // POST and GET /graphql
	.plugin(apiDocs({ spec: 'openapi.yaml', enabled: dev })); // GET /docs

// the REST routes against the document: the GraphQL endpoint is not one of its operations
matchesSpec(app, operations, { exclude: (route) => route.path === '/graphql' });
```

- `/docs` documents the REST operations only; the GraphQL schema is its own
  document, explored at `/graphql`.
- Each page sets its own `Content-Security-Policy`; `secureHeaders` keeps
  both, and guards the rest.
- `apiDocs` leaves its own routes to `matchesSpec`; the GraphQL endpoint is
  excluded by its path, as above.
