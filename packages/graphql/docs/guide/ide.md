# GraphiQL and Apollo Sandbox

This page covers what a browser gets when it opens the endpoint — Yoga's
GraphiQL, Apollo Sandbox, or nothing — their options, the
`Content-Security-Policy` each loads under, and `renderSandbox` for serving
the Sandbox yourself.

```ts
import { alxia } from '@alxia/core';
import { graphql } from '@alxia/graphql';
import { createSchema } from 'graphql-yoga';

const schema = createSchema({
	typeDefs: /* GraphQL */ `type Query { hello: String! }`,
	resolvers: { Query: { hello: () => 'world' } },
});

const app = alxia().plugin((app) =>
	graphql(app, {
		schema,
		ide: Bun.env['NODE_ENV'] === 'production' ? false : 'apollo-sandbox',
		sandbox: { title: 'Hello API', initialDocument: '{ hello }' },
	}),
);
// open http://localhost:3000/graphql in a browser
```

## `ide`

| `ide` | A browser's `GET` at the endpoint gets | Options |
| --- | --- | --- |
| `'graphiql'` (default) | Yoga's GraphiQL | `graphiql` |
| `'apollo-sandbox'` | [Apollo Sandbox](https://www.apollographql.com/docs/graphos/platform/sandbox), embedded | `sandbox` |
| `false` | no page: the request is answered as a GraphQL request | — |

A `GET` that accepts `text/html` gets the page: GraphiQL with or without a
`query` parameter (it opens with that query), Apollo Sandbox only without
one. Every other request is a GraphQL request, answered in JSON. A browser
sends `*/*` beside `text/html`, so where no page is served — `ide: false`,
or Sandbox with `?query=` — it gets the JSON result (or
`Must provide query string.` with no query). A client whose `Accept` allows
only `text/html` gets a [`406` with an empty
body](../troubleshooting.md#406-with-an-empty-body) instead.

Both IDEs run the schema's introspection and any operation against the
endpoint, behind the same middlewares as every other request: a guard before
the endpoint guards the page too, and a browser without a token gets the
guard's reply. Turn the IDE off in production unless you mean to publish
it.

## GraphiQL

The default. `graphiql` takes Yoga's `GraphiQLOptions` — not `true` or
`false`, which `ide` decides:

```ts
graphql(app, {
	schema,
	graphiql: {
		title: 'Users API',
		defaultQuery: '{ me }',
		headers: JSON.stringify({ authorization: 'Bearer <token>' }),
	},
});
```

Its other options — `subscriptionsProtocol`, `credentials`,
`additionalHeaders`… — are listed in
[Yoga's GraphiQL documentation](https://the-guild.dev/graphql/yoga-server/docs/features/graphiql).

The page loads GraphiQL from `unpkg.com`. Yoga's response has no
`Content-Security-Policy`, so the package adds one that lets it load:

```text
default-src 'self'; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: https:; font-src 'self' data: https:; worker-src 'self' blob:; connect-src 'self'
```

## Apollo Sandbox

`ide: 'apollo-sandbox'` serves a page embedding Apollo Sandbox, pointed at
the endpoint: the route as served, prefixes included, resolved in the
browser against the address the page was opened at. Behind a proxy that
terminates TLS, the Sandbox asks over `https` as the browser did, with no
option and no `X-Forwarded-Proto`. `sandbox` takes `SandboxOptions`:

```ts
interface SandboxOptions {
	readonly title?: string;
	readonly initialDocument?: string;
	readonly initialHeaders?: Readonly<Record<string, string>>;
	readonly pollForSchemaUpdates?: boolean;
	readonly includeCookies?: boolean;
}
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `title` | `string` | `'Sandbox Explorer'` | The page's `<title>`. |
| `initialDocument` | `string` | none | The operation the Sandbox opens with. |
| `initialHeaders` | `Record<string, string>` | none | Headers every operation sends, shown and editable in the Sandbox. |
| `pollForSchemaUpdates` | `boolean` | `true` | Whether the Sandbox polls the schema as it changes. |
| `includeCookies` | `boolean` | `true` | Whether operations send the browser's cookies, such as a session cookie. |

```ts
graphql(app, {
	schema,
	ide: 'apollo-sandbox',
	sandbox: {
		title: 'Users API',
		initialDocument: '{ me }',
		initialHeaders: { 'x-tenant': 'acme' },
		includeCookies: false,
	},
});
```

The endpoint shown in the Sandbox is not editable. Every value is escaped
into the page's HTML and script, so a title or document from configuration
cannot break out of it.

The page loads the Sandbox's script from Apollo's CDN and frames
`sandbox.embed.apollographql.com`; it is sent with `SANDBOX_POLICY`:

```text
default-src 'self'; script-src 'self' 'unsafe-inline' https://embeddable-sandbox.cdn.apollographql.com; style-src 'self' 'unsafe-inline'; frame-src https://sandbox.embed.apollographql.com; img-src 'self' data: https:; connect-src 'self'
```

## With `@alxia/secure-headers`

`@alxia/secure-headers` keeps a header a response already has, so the
IDE's policy survives it and every other route keeps the strict one. A middleware
of your own that **overwrites** `Content-Security-Policy` on every
response blocks the IDE's scripts, and the page stays blank: set it only
when the response has none.

```ts
import { alxia, defineMiddleware, settle, withHeaders } from '@alxia/core';

const defaultPolicy = defineMiddleware(async (ctx, next) =>
	withHeaders(await settle(ctx, next()), (headers) => {
		if (!headers.has('content-security-policy'))
			headers.set('content-security-policy', "default-src 'self'");
	}),
);

const app = alxia()
	.use(defaultPolicy)
	.plugin((app) => graphql(app, { schema }));
```

## `renderSandbox`

```ts
function renderSandbox(endpoint: string, options?: SandboxOptions): string;
const SANDBOX_POLICY: string;
```

The page `ide: 'apollo-sandbox'` serves, as an HTML string, for a Sandbox
you serve yourself: at another path than the endpoint, or pointed at
another server. `endpoint` is a URL, or a path the page resolves in the
browser against its own address — so `'/graphql'` is asked over `https`
when the page was opened over `https`, proxy or not. Send it with
`SANDBOX_POLICY`:

```ts
import { alxia } from '@alxia/core';
import { graphql, renderSandbox, SANDBOX_POLICY } from '@alxia/graphql';

const app = alxia()
	.plugin((app) => graphql(app, { schema, ide: false }))
	.get('/explorer', ({ reply }) =>
		reply(200, renderSandbox('/graphql', { title: 'Users API' }), {
			headers: {
				'content-type': 'text/html;charset=utf-8',
				'content-security-policy': SANDBOX_POLICY,
			},
		}),
	);
```

Pass the path the browser sees when a proxy serves the app under one of its
own — `renderSandbox('/v1/graphql')` — and a full URL for an endpoint on
another server: `renderSandbox('https://api.example.com/graphql')`.

## See also

- [Mounting the endpoint](endpoint.md): which middlewares run before the page.
- [Troubleshooting](../troubleshooting.md#the-ide-page-is-blank): a blank IDE page.
