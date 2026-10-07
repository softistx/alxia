# Testing with the generated client

The same run of `@nxgt/openapi-codegen` that writes `alxia.ts` writes
`operations.ts`, the table [`@nxgt/openapi-httpyz`](https://www.npmjs.com/package/@nxgt/openapi-httpyz)
binds onto an [`@nxgt/httpyz`](https://www.npmjs.com/package/@nxgt/httpyz)
client. The client takes a `fetch`: give it `app.fetch`, and a test calls the
app in process, with no server and no port, and every path, parameter, body
and reply typed by `openapi.yaml`. Any OpenAPI client works the same way,
since the document is the contract.

```sh
bun add -d @nxgt/httpyz @nxgt/openapi-httpyz
```

```ts
import { expect, test } from 'bun:test';
import { createHttpClient } from '@nxgt/httpyz';
import { createOpenApiClient } from '@nxgt/openapi-httpyz';
import { app } from './app';
import { operations } from './generated/operations';

const http = createHttpClient({
  baseUrl: 'http://alxia.test',
  fetch: (request) => app.fetch(request),
});
const api = createOpenApiClient(http, operations);

test('creates a todo', async () => {
  const reply = await api.op('createTodo', { json: { title: 'Write a route' } });
  expect(reply.status).toBe(201);
  if (reply.status === 201) expect(reply.data.title).toBe('Write a route');
});
```

`baseUrl` only has to be a valid URL: nothing is sent to it. The client calls
`fetch` with a `Request`, which `app.fetch` takes as is.

## What the types catch

A test that no longer matches the document stops compiling, before it runs:

```ts
await api.get('/todos/{id}', { param: { id: 'first' } }); // id is a number
await api.op('createTodo', { json: { name: 'x' } }); // no such field
await api.get('/todo'); // no such path
```

A reply is a union narrowed on its status: `reply.data` is the success body
when `reply.status` is 200 or 201, and `NotFound`, `Unauthorized` or alxia's
400 for those statuses. `reply.response` is the `Response`, for its headers.
A status the spec does not declare for the operation throws
`UndeclaredStatusError`.

## Headers the spec does not list

An API key declared under `security` is not a parameter, so pass it as a
header of the client, or of one call:

```ts
const http = createHttpClient({
  baseUrl: 'http://alxia.test',
  fetch: (request) => app.fetch(request),
  headers: { 'x-api-key': 'test-key' },
});

await api.op('createTodo', { json: { title: 'x' } }, { headers: { 'x-api-key': 'wrong' } });
```

## Keep one `app.request` test

The client checks a request against the spec before it sends it, and throws
a `ValidationError` for one the server would refuse. To see the server
refuse it, bind a client with `createOpenApiClient(http, operations, {
validate: { request: false } })`. A request the types forbid, an id that is
not a number or a missing header, needs `app.request`, which sends what it
is told:

```ts
test('refuses an id that is not a number', async () => {
  expect((await app.request('/todos/first')).status).toBe(400);
});
```

Use the client for the contract, and `app.request` for what breaks it.

## Beside `matchesSpec`

`matchesSpec(app, operations)` ([the checks](checks.md)) proves every
operation has a route (and, under `strict`, every route an operation), and the client proves a call to it answers as the
spec says. Run both.
