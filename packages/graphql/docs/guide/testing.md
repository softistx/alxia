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

## Not covered

It always POSTs JSON. A subscription over server-sent events or a socket,
a `GET` and a persisted operation sent by hash are not sent by it; use
`app.request` for those (the
[recipe](https://github.com/softistx/alxia/blob/develop/docs/recipes/graphql-api.md#6-test-it-in-process)
reads a stream).
