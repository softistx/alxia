# Harden a GraphQL API for production

A GraphQL endpoint mounted as in [the endpoint guide](endpoint.md) works. What a GraphQL API exposed to the internet also
needs is not in a schema: one request can ask for a great deal, nothing says
who may ask how often, and the defaults that help a developer help an
attacker. Seven points, each a few lines, from the
[GraphQL API recipe](https://github.com/softistx/alxia/blob/develop/docs/recipes/graphql-api.md),
whose files they are (`src/context.ts` holds the base, which each app builds on with `base.fork()`). Add the packages the snippets use:

```sh
bun add @alxia/rate-limit @envelop/depth-limit @graphql-yoga/plugin-csrf-prevention @graphql-yoga/plugin-persisted-operations
```

## Rate limit the endpoint

`@alxia/rate-limit` goes to `use` before the endpoint, and counts the
requests to it. Key it by the viewer, so one user's allowance is theirs
wherever they connect from, and by the client's address for an anonymous
request. Behind a proxy, the address is the proxy's unless the app reads the
header it appends to, with core's `forwardedIp`, which never believes the
entries the client wrote (the recipe's base reads the number of proxies from
`PROXY_HOPS`):

```ts
import { alxia, forwardedIp } from '@alxia/core';

const base = alxia({ ip: forwardedIp({ trusted: 1 }) }); // one proxy in front
```

```ts no-check
// file: src/limits.ts
import { rateLimit } from '@alxia/rate-limit';
import type { UserRecord } from './store';

// What is counted: the viewer's id, else the client's address. `undefined`
// is not counted: with no address (a request made in process, with no
// socket) there is nothing to count.
export const keyOf = ({ viewer, ip }: { viewer: UserRecord | null; ip: string | undefined }) =>
	viewer ? `user:${viewer.id}` : ip && `ip:${ip}`;

// `max` requests a minute for each key. Past it, a 429 with `Retry-After`.
export const limitTo = (max: number) =>
	rateLimit<{ viewer: UserRecord | null }>({ limit: max, windowMs: 60_000, key: keyOf });
```

**One HTTP request is not one operation.** A client may send an array of
operations in a single `POST` when `batching` is on, and a document may ask
for a hundred fields, or the same expensive field a hundred times under
aliases. The limit counts the request: keep `batching` off, or give it a
small `limit`, and bound the cost of one operation with the next point.

## Limit depth and complexity

`useDepthLimit` from `@envelop/depth-limit` refuses a document nested deeper
than `maxDepth` before it executes
([Yoga's plugins](yoga.md#plugins) shows
it beside the others). Depth is one dimension: aliases, list sizes and
fragments multiply the work at a depth that is allowed, so give every list
argument a maximum in the schema, and add a cost plugin when a client
may write its own documents.

```ts
// file: src/depth.ts
import { useDepthLimit } from '@envelop/depth-limit';

// A document nested deeper than `maxDepth` is refused at validation, before
// a resolver runs: a 200 with `errors`, GraphQL's own format.
export const depthLimit = (maxDepth: number) => useDepthLimit({ maxDepth });
```

## Introspection off in production

Introspection hands anyone the whole schema, the fields you meant to keep
quiet included. GraphiQL needs it, so it follows the same switch: on in
development, off everywhere else. `isDev(context)` is the `ide`'s own test
(`alxia({ dev })`, else `NODE_ENV=development`), and the plugin adds
graphql-js's rule that refuses `__schema` and `__type` otherwise.

```ts
// file: src/introspection.ts
import { isDev } from '@alxia/core';
import { NoSchemaIntrospectionCustomRule } from 'graphql';
import type { Plugin } from 'graphql-yoga';

export const introspectionOnlyInDev: Plugin = {
	onValidate({ addValidationRule, context }) {
		if (!isDev(context)) addValidationRule(NoSchemaIntrospectionCustomRule);
	},
};
```

This hides the schema from a client that asks, not from one that guesses
field names: it is not authorisation. Yoga's error suggestions ("Did you
mean…") also leak names; the plugin `@escape.tech/graphql-armor-block-field-suggestions`
removes them.

## Masked errors

Yoga masks errors by default (`maskedErrors: true`): an `Error` a resolver
throws reaches the client as `Unexpected error.`, with its message and stack
kept on the server. Leave it on. To tell the client something, throw a
`GraphQLError`, whose message is shown, with an `extensions.code` the client
can switch on; `extensions.http.status` puts the same refusal on the HTTP
status too (the [layers of an auth error](https://github.com/softistx/alxia/blob/develop/docs/recipes/graphql-api.md#auth-errors-in-three-layers)).

```ts
// file: src/errors.ts
import { GraphQLError } from 'graphql';

// What a client may read: a stable `code`, and a message meant for people.
export function invalid(message: string, field: string): GraphQLError {
	return new GraphQLError(message, { extensions: { code: 'BAD_USER_INPUT', field } });
}

export function notFound(what: string): GraphQLError {
	return new GraphQLError(`No ${what}`, { extensions: { code: 'NOT_FOUND', http: { status: 404 } } });
}
```

## Cap what a request costs

Yoga parses a document before any resolver guard runs, and a parsed
document stays in a cache. Both are bounded by default, by the document's
**tokens**: the words, names and punctuation the parser reads. Measured on
graphql 16 and 17, a parsed token costs between 178 and 509 bytes of heap
whatever its shape (4 000 aliases, one-character fields, nested lists,
directives), where the cost per character swings from 58 to 254. So the
count of tokens is the weight, and 512 bytes per token the upper estimate: a
document of 15 000 tokens parses to 7.7 MB at most (15 000 × 512 B); a
measured heavy document of about 12 000 tokens weighs about 6 MB.

The cache weighs a document as its tokens (comments included) × 512 B, plus
4 B per source character, plus 32 B per source character of string literals
with escapes (`\n`, `\u00e9`), whose value graphql 16 builds as a rope; or
36 B per character in all when the document has no locations (`noLocation`),
since nothing then tells where the strings are. A location-less document of
1 MB weighs over 8 MiB and is not cached. The weight is an estimate by
design, not an exact measure.

Yoga's validation results for a cached document (up to about 100 errors
each) sit outside the weight, bounded at roughly 70 KB per document.

`maxTokens` does not count comments, yet a
parsed document keeps all of them alive: a 750 KB body of `#` lines holds
about 19.6 MB, so it weighs more than the cache keeps and is parsed again
each time instead of cached.

- **`maxTokens`, 15 000 by default** (Apollo Router's own limit). The
  introspection query is 163 tokens and a large screen query with its
  fragments a few thousand, so a client written for a federated graph passes.
  A longer one is
  refused before it runs, as any document the parser cannot read is:
  `GRAPHQL_PARSE_FAILED`, `Syntax Error: Document contains more than 15000
  tokens. Parsing aborted.` (graphql 16 words it `more that`), HTTP 400 under
  `application/graphql-response+json` and 200 under `application/json`,
  never logged. It applies to `POST`, `GET`, each operation of a batch and
  each operation over WebSocket. `maxTokens: false` turns it off; a plugin of
  yours that sets its own parse function replaces it.
- **`maxDepth`, 1 000 by default.** graphql-js parses by recursion, so a
  document nested a few thousand levels deep (`{ a { a { …`, `[[[…`) overflows
  the stack while it is still well under `maxTokens`, and would answer a 500
  `Unexpected error.` and log it. alxia scans the source for the nesting of
  `{`, `(` and `[` first, linearly and ignoring strings, block strings and
  comments, and refuses a deeper document as `GRAPHQL_PARSE_FAILED`,
  `Syntax Error: Document is nested more than 1000 levels deep. Parsing
  aborted.`, with the same status and no log as `maxTokens`. A document that
  overflows the stack anyway (`maxDepth: false`, or a limit raised too far)
  is refused as `Syntax Error: Document is nested too deeply to parse.`
  `maxDepth: false` turns the scan off; a real query nests a dozen levels.
- **`parseCache`**, a least-recently-used cache per endpoint, weighed in
  bytes: `maxBytes` (64 MiB), `max` documents (1 024) and `ttl` (one hour).
  A document heavier than an eighth of `maxBytes` is not kept and is parsed
  again each time. Yoga's own cache holds up to 1 024 documents whatever their
  size, which is gigabytes for distinct large queries. `parseCache: false`
  keeps nothing. An app with its own cache store gives Yoga's
  `parserAndValidationCache`, which replaces this one, and must bound it
  too; giving both throws where `graphql()` is declared.

```ts
graphql(app, {
	schema,
	maxTokens: 20_000,
	parseCache: { maxBytes: 32 * 1024 * 1024 },
});
```

### The body

Yoga reads the whole body of a `POST` before it parses it, so a megabyte of
JSON costs a megabyte of memory. The `POST` route has a body limit, counted
as the bytes arrive:

- **`bodyLimit`, 1 MiB by default.** Give the option to `graphql()`, or
  declare core's `bodyLimit(bytes)` before it: that limit is kept as it is,
  and the option wins over it. A query is a few kilobytes, so for an API that
  takes no uploads, 100 KiB is generous. A mutation that takes a file by
  `multipart` needs a larger limit, in the option. A plugin app mounted
  under a prefix keeps the limit of its own scope; the outer app's
  `bodyLimit()` does not reach it.
- **The 413.** Yoga would report a body it could not read as `400`, `POST
  body sent invalid JSON.`; `@alxia/graphql` throws core's
  `ContentTooLargeError` again instead, so a client gets the 413 a plain
  route answers, in the app's error format (`application/problem+json` under
  `errors: 'problem'`), with a `Content-Length` or without one (a chunked
  body). It carries the headers Yoga's plugins set, such as a
  `Cache-Control: no-store` from an `onResponse` hook. A form-urlencoded or
  `application/graphql` body past the limit is refused the same way and logs
  nothing. Whatever else Yoga cannot parse is still its 400, and its
  parser's own error is never sent (`extensions.originalError` is removed).
- **Order.** The body is read by the endpoint, after every middleware
  declared before it, `bodyLimit()` included: those still run for an
  oversized body. Declare the cheap observers first and the costly
  middlewares (a session lookup, a database call) as late as you can. A
  refusal answered before Yoga runs cannot carry Yoga's headers: set the ones
  every response needs in a middleware.

```ts
graphql(app, {
	schema,
	maxTokens: 20_000,
	parseCache: { maxBytes: 32 * 1024 * 1024 },
	bodyLimit: 100 * 1024,
});
```

## CSRF for a cookie-authenticated API

A bearer token in a header cannot be sent by another site's form. A
**cookie** can: a page on another origin may make the browser `POST` the
cookie to `/graphql`. `SameSite=Lax` on the cookie is the first line (a
cross-site `POST` does not carry it); two more close the rest.

- Yoga's CSRF prevention plugin refuses a request without a custom header
  (`x-graphql-yoga-csrf` by default): a browser cannot add one to a request
  across origins without a CORS preflight, which `@alxia/cors` answers only
  for the origins you named.
- Require `application/json` on a `POST`, which an HTML form cannot send. Yoga
  also accepts a form-encoded `POST` and a `GET` query, the two a form or a
  link can make, so this is a middleware before the endpoint.

```ts
// file: src/csrf.ts
import { defineMiddleware, HttpError } from '@alxia/core';
import { useCSRFPrevention } from '@graphql-yoga/plugin-csrf-prevention';

export const csrf = useCSRFPrevention({ requestHeaders: ['x-csrf'] });

// A POST that is not JSON is refused with a 415 before Yoga reads it.
export const jsonOnly = defineMiddleware(async ({ request }, next) => {
	if (request.method === 'POST' && !request.headers.get('content-type')?.startsWith('application/json')) {
		throw new HttpError(415, { error: 'unsupported_media_type' });
	}
	return next();
});
```

## Persisted operations, briefly

A client that sends only the hash of an operation it registered at build
time cannot send any other: the strongest limit on what it can ask. Yoga's
[persisted operations plugin](https://the-guild.dev/graphql/yoga-server/docs/features/persisted-operations)
works as it does elsewhere, since it is a Yoga plugin in the route:

```ts
// file: src/persisted.ts
import { usePersistedOperations } from '@graphql-yoga/plugin-persisted-operations';
import type { Plugin } from 'graphql-yoga';

// Hash to document: from a file the build wrote, here a literal.
export const operations = new Map([
	['5f1bb2a0c2a0', '{ notes { text } }'],
]);

// `allowArbitraryOperations: false` refuses any document that was not
// registered, the point of it. Apollo's `extensions.persistedQuery.sha256Hash`
// names the operation.
export const persisted: Plugin = usePersistedOperations({
	allowArbitraryOperations: false,
	getPersistedOperation: (hash) => operations.get(hash) ?? null,
});
```

## Together

`maxTokens` and `parseCache` need no line here: their defaults apply. The
`bodyLimit()` below is the app's own and is kept; without it the `POST` takes
1 MiB.

```ts no-check
// file: src/production.ts
import { logger } from '@alxia/logger';
import { base } from './context';
import { csrf, jsonOnly } from './csrf';
import { depthLimit } from './depth';
import { introspectionOnlyInDev } from './introspection';
import { limitTo } from './limits';
import { createLoaders } from './loaders';
import { schema } from './schema';
import { graphql } from '@alxia/graphql';

export const production = base.fork()
	.use(logger())
	.use(limitTo(120)) // the probes above it are not counted
	.use(jsonOnly)
	.bodyLimit(100 * 1024) // a body past 100 KiB is refused (a 413), for the routes below
	.plugin((app) =>
		graphql(app, {
			schema,
			context: () => ({ loaders: createLoaders() }),
			logging: false,
			plugins: [depthLimit(8), introspectionOnlyInDev, csrf],
		}),
	);
```

The recipe's spec runs each point against this app and a small schema, in
process: the 429 for a viewer and for an address (a batch of three counts
once), a document too deep, introspection refused outside development and
answering in it, a masked `Error` beside a `GraphQLError` with its
extensions, the body limit, the CSRF header, the `415`, and a persisted
hash running while an arbitrary document is refused
([the recipe](https://github.com/softistx/alxia/blob/develop/docs/recipes/graphql-api.md#7-harden-it-for-production)).
