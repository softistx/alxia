# Testing with the generated client

The same run of `@nxgt/openapi-codegen` that writes `alxia.ts` writes
`paths.ts`, the document's types in the shape
[openapi-fetch](https://openapi-ts.dev/openapi-fetch/) reads. Its client
takes a `fetch`: give it `app.fetch`, and a test calls the app in process,
with no server and no port, and every path, parameter, body and reply typed
by `openapi.yaml`.

```sh
bun add -d openapi-fetch
```

```ts
import { expect, test } from 'bun:test';
import createClient from 'openapi-fetch';
import { app } from './app';
import type { paths } from './generated/paths';

const api = createClient<paths>({
  baseUrl: 'http://alxia.test',
  fetch: (request) => app.fetch(request),
});

test('creates a todo', async () => {
  const { data, response } = await api.POST('/todos', {
    body: { title: 'Write a route' },
  });
  expect(response.status).toBe(201);
  expect(data?.title).toBe('Write a route'); // data: Todo | undefined
});
```

`baseUrl` only has to be a valid URL: nothing is sent to it. openapi-fetch
calls `fetch` with a `Request`, which `app.fetch` takes as is.

## What the types catch

A test that no longer matches the document stops compiling, before it runs:

```ts
await api.GET('/todos/{id}', { params: { path: { id: 'first' } } }); // id is a number
await api.POST('/todos', { body: { name: 'x' } }); // no such field
await api.GET('/todo'); // no such path
```

`data` is the success reply, `error` the other statuses the spec declares
(`NotFound`, `Unauthorized`, alxia's 400), and `response` the `Response`,
for its status and headers.

## Headers the spec does not list

An API key declared under `security` is not a parameter, so pass it as a
header of the client, or of one call:

```ts
const api = createClient<paths>({
  baseUrl: 'http://alxia.test',
  fetch: (request) => app.fetch(request),
  headers: { 'x-api-key': 'test-key' },
});

await api.POST('/todos', { body: { title: 'x' }, headers: { 'x-api-key': 'wrong' } });
```

## Keep one `app.request` test

The client sends only what the spec allows. A request the spec forbids, an
id that is not a number, a malformed body or a missing header, needs
`app.request`, which sends what it is told:

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
