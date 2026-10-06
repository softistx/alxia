# Testing the endpoint

`graphqlClient` sends an operation to an app's GraphQL endpoint in process,
through `app.fetch`: no port, no server, and the whole chain in play (the
app's middlewares, its body limit, Yoga's plugins). It is a helper for
specs, so it lives in its own subpath, `@alxia/graphql/testing`: the main
entry stays what an app ships, and a production bundle never carries it.

```ts
import { expect, test } from 'bun:test';
import { graphqlClient } from '@alxia/graphql/testing';
import { app } from './app';

test('hello', async () => {
	const { status, data, errors } = await graphqlClient(app).query(
		'query ($name: String!) { hello(name: $name) }',
		{ variables: { name: 'Ada' } },
	);
	expect(status).toBe(200);
	expect(errors).toBeUndefined();
	expect(data).toEqual({ hello: 'hello Ada' });
});
```

## What `app` can be

`graphqlClient` calls `app.fetch(request)`, so `app` is an alxia app or anything
with a `fetch(Request)` that answers a `Response`: a Yoga instance, a
handler of your own, a stub.

```ts
const client = graphqlClient({ fetch: (request) => yoga.fetch(request) });
```

## The result

`query` resolves to `{ status, data?, errors?, response }`:

| field | |
| --- | --- |
| `status` | the HTTP status: 200 for a GraphQL answer, errors included; 400 for a request Yoga refuses, 401 or 403 from a guard, 413 over a body limit |
| `data`, `errors` | the JSON body's own, each unset when the body has none |
| `response` | the `Response`, its body unread: `headers`, `ok` |

A GraphQL error is an entry of `errors`, never a rejection. A body that is
not JSON (a 413, a 404) leaves `data` and `errors` unset: read `status`.

## Headers

`graphqlClient(app, { headers })` sends them with every query, which is
where a token goes; a call's `headers` are added to them, and replace one of
the same name:

```ts
const ada = graphqlClient(app, { headers: { authorization: `Bearer ${token}` } });

expect((await ada.query('{ me { name } }')).data).toEqual({ me: { name: 'Ada' } });

const anonymous = await ada.query('{ me { name } }', { headers: { authorization: '' } });
```

## A custom path

`path` is the endpoint's, `/graphql` by default:

```ts
const client = graphqlClient(app, { path: '/api/graphql' });
```

## Variables and operation names

```ts
await client.query(document, { variables: { id: '1' }, operationName: 'GetNote' });
```

`TData` and `TVars` are the result's and the variables' types, and default
to `unknown` and `Record<string, unknown>`; name them when the document is a
string: `client.query<{ me: { name: string } }>('{ me { name } }')`.

## A typed document

A `TypedDocumentNode`, as GraphQL Code Generator's `typed-document-node`
plugin writes it (`@graphql-typed-document-node/core`), or `graphql`'s own
`TypedQueryDocumentNode`, is printed to a string, and gives `data` and
`variables` their types, with no extra dependency:

```ts
import type { TypedQueryDocumentNode } from 'graphql';
import { parse } from 'graphql';

const Hello = parse('query Hello($name: String!) { hello(name: $name) }') as TypedQueryDocumentNode<
	{ hello: string },
	{ name: string }
>;

const { data } = await client.query(Hello, { variables: { name: 'Ada' } });
data?.hello; // string
// client.query(Hello, { variables: { name: 1 } }); // compile error
```

## GET

`method: 'GET'` puts the operation in the URL instead of a JSON body:
`query`, `operationName`, and `variables` and `extensions` as JSON. Set it
per call, or for every call with `graphqlClient(app, { method: 'GET' })`; a
call's own `method` wins.

```ts
const { data } = await client.query('query ($name: String) { hello(name: $name) }', {
	method: 'GET',
	variables: { name: 'Ada' },
});
```

A `GET` has no `Content-Type`.

## Persisted operations

`persisted` is the hash of an operation the app registered. It is sent as
Apollo's `extensions.persistedQuery: { version: 1, sha256Hash }`, the shape
`@graphql-yoga/plugin-persisted-operations` reads by default. With no
document, only the hash is sent, so an app that allows nothing else
(`allowArbitraryOperations: false`) can be tested; `TData` is yours to name,
since nothing types it:

```ts
const result = await client.query<{ notes: { text: string }[] }>({
	persisted: '5f1bb2a0c2a0',
	variables: { first: 10 },
	method: 'GET', // or the default POST
});
```

With a document too, both are sent (Apollo's automatic persisted queries
register one that way). An unknown hash is the server's own answer, not a
client error: with the plugin's defaults, `errors[0].message` is
`PersistedQueryNotFound`, with code `PERSISTED_QUERY_NOT_IN_LIST`; a
document sent to an app that allows only persisted ones is
`PersistedQueryOnly`.

An app that names an operation by an **id** in an extension of its own
(a custom `extractPersistedOperationId`) is sent that extension: `extensions`
is sent as given, and counts as a call with no document.

```ts
await client.query({ extensions: { documentId: 'abc123' } });
```

## CSRF

The client sends **no CSRF header of its own**: its name belongs to the app
(`x-graphql-yoga-csrf` by default in Yoga's `useCSRFPrevention`, `x-csrf` in
the [recipe](https://github.com/softistx/alxia/blob/develop/docs/recipes/graphql-api.md)),
and a spec that never sends it could not see the plugin refuse. Put it in the
client's `headers`, as a browser app does in its own client. Yoga's plugin lets
a JSON `POST` through with no header, since a browser needs a preflight for
that content type, but refuses a `GET` (no content type) with a 403
(`Required CSRF header(s) not present`): test that with a `GET` without the
header, and the app's real traffic with it.

```ts
const production = graphqlClient(app, { headers: { 'x-csrf': '1' } });
expect((await graphqlClient(app).query('{ me { name } }', { method: 'GET' })).status).toBe(403);
```

## Not covered

A subscription over server-sent events or a socket, a form-encoded `POST`
and a batch are not sent by it; use `app.request` for those (the
[recipe](https://github.com/softistx/alxia/blob/develop/docs/recipes/graphql-api.md#6-test-it-in-process)
reads a stream, and checks the 415 a form gets).
