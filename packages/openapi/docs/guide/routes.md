# How a route is documented

This page covers what each part of a route's schema becomes in the
document, and what the package adds on its own: the 400, the 500, the
operation id. Nothing is written twice — the route's schema is the only
source.

```ts
import { alxia } from '@alxia/core';
import { openapi } from '@alxia/openapi';
import { z } from 'zod';

const User = z.object({ id: z.number(), name: z.string() });

const app = alxia().get(
	'/users/:id',
	{
		params: z.object({ id: z.coerce.number() }),
		query: z.object({ expand: z.string().optional() }),
		response: { 200: User, 404: z.object({ error: z.literal('not_found') }) },
		detail: { summary: 'One user', tags: ['users'] },
	},
	({ reply }) => reply(404, { error: 'not_found' }),
);

const get = openapi(app, { info: { title: 'Users', version: '1.0.0' } }).paths['/users/{id}']?.get;
// get.operationId  'getUsersById'
// get.summary      'One user'
// get.tags         ['users']
// get.parameters   [
//   { name: 'id', in: 'path', required: true, schema: { type: 'number' } },
//   { name: 'expand', in: 'query', required: false, schema: { type: 'string' } },
// ]
// get.responses    '200' (User), '404', '400' (ValidationError), '500' (InternalError)
```

## At a glance

| Route | In the document |
| --- | --- |
| the path | the key in `paths`: `:id` is `{id}`, a trailing `*` is `{path}` |
| the method | the key under the path, lowercase |
| `params` | one `path` parameter per segment, always required |
| `query` | one `query` parameter per property |
| `headers` | one `header` parameter per property |
| `cookies` | one `cookie` parameter per property |
| `body` | a required `application/json` request body: what the schema **accepts** |
| `response` | one reply per status: what the schema **gives back** |
| no `response` | a single `default` reply, `The reply of the handler` |
| any of `params`, `query`, `headers`, `cookies`, `body` | a `400`, `ValidationError` — beside the route's own `400`, when it declares one |
| every route | a `500`, `InternalError` — beside the route's own `500`, when it declares one |
| `detail` | `summary`, `description`, `tags`, `deprecated`, `operationId` |

WebSocket routes (`app.ws`) are not in `app.routes`, and are not
documented.

## The path

```ts
import { openApiPath } from '@alxia/openapi';

openApiPath('/users/:id');     // '/users/{id}'
openApiPath('/files/*');       // '/files/{path}'
openApiPath('/a/:b/*');        // '/a/{b}/{path}'
```

The path is the route's full path, with the prefix of every group and
app it was mounted under.

## Parameters

Each parameter's schema is the property of the same name in the route's
schema, converted on its **input** side: what the request carries.

```ts
interface Parameter {
	name: string;
	in: 'path' | 'query' | 'header' | 'cookie';
	required: boolean;
	schema: JsonSchema;
	description?: string;
}
```

- **Path parameters** come from the path, not the schema: every `:name`
  and `*` is a parameter, required. Its schema is the `params` property of
  that name — `*` reads the property `'*'` — and `{ type: 'string' }`
  when `params` does not declare it.
- **Query, header and cookie parameters** come from the schema's
  `properties`: one parameter per property, `required` when the schema's
  `required` lists it. A property's `description` is copied onto the
  parameter.
- **Headers** are named as the schema names them. The app reads headers
  lowercased, so declare them lowercase: `'x-tenant'`, not `'X-Tenant'`.

```ts
const app = alxia().get(
	'/reports',
	{
		query: z.object({ from: z.string().describe('ISO date, inclusive') }),
		headers: z.object({ 'x-tenant': z.string() }),
		cookies: z.object({ session: z.string() }),
	},
	({ reply }) => reply(200, 'ok'),
);
// parameters:
//   { name: 'from', in: 'query', required: true, schema: {...}, description: 'ISO date, inclusive' }
//   { name: 'x-tenant', in: 'header', required: true, schema: { type: 'string' } }
//   { name: 'session', in: 'cookie', required: true, schema: { type: 'string' } }
```

A schema that does not convert to an object with `properties` — a union
of objects, a schema documented as `{}` — gives no parameters at all
(see [Troubleshooting](../troubleshooting.md#a-route-has-no-parameters)).

Because the input side is used, a coercion or a transform is documented
by what the client sends: `z.coerce.number().int()` is an integer, and
`z.string().transform(Number)` is a string.

## The request body

```ts
const app = alxia().post(
	'/users',
	{ body: z.object({ name: z.string() }), response: { 201: User } },
	({ reply, body }) => reply(201, { id: 1, name: body.name }),
);
// requestBody: { required: true, content: { 'application/json': { schema: { type: 'object', properties: { name: ... }, required: ['name'] } } } }
```

The body is documented as `application/json`, required, by what its
schema accepts. A route that also accepts a form or text is still
documented as JSON.

## Replies

Each status in `response` is a reply, converted on its **output** side:
what goes over the wire.

| The schema | The reply |
| --- | --- |
| a `204` or `304` | a description, no content |
| an `eventStream(...)` | `text/event-stream`, by the schema of one event |
| one that converts to `{ type: 'string' }` | `text/plain` |
| any other | `application/json` |

```ts
import { alxia, eventStream } from '@alxia/core';

const app = alxia()
	.get('/health', { response: { 200: z.string() } }, ({ reply }) => reply(200, 'ok'))
	.delete('/users/:id', { response: { 204: z.undefined() } }, ({ reply }) => reply(204))
	.get(
		'/ticks',
		{ response: { 200: eventStream(z.object({ n: z.number() })) } },
		({ reply }) => reply(200, (async function* () {})()),
	);
// /health 200  → content['text/plain'].schema         { type: 'string' }
// /users/{id} 204 → { description: 'No content' }
// /ticks 200   → content['text/event-stream'].schema  { type: 'object', properties: { n: ... } }
```

A reply's `description` is the status's name for `200`, `201`, `202`,
`204`, `400`, `401`, `403`, `404`, `409` and `422` (`'OK'`, `'Not found'`…),
and `HTTP <status>` for any other.

A route with no `response` at all has a single `default` reply, `The
reply of the handler`, with no schema: its handler may answer anything.

## The 400 and the 500

Every route that validates its request — any of `params`, `query`,
`headers`, `cookies` or `body` — documents a `400` with the body the app
answers when validation fails. Every route documents a `500`. Both point
at `components.schemas`:

```json
"400": {
  "description": "The request was refused",
  "content": { "application/json": { "schema": { "$ref": "#/components/schemas/ValidationError" } } }
}
```

```ts
// components.schemas.ValidationError
{ error: 'validation', issues: { target: 'params' | 'query' | 'headers' | 'cookies' | 'body'; path: (string | number)[]; code: string; message: string }[] }
// components.schemas.InternalError
{ error: 'internal' }
```

A route that declares its own `400` or `500` in `response` keeps it. The
app can still answer its own 400 when validation fails, and its 500 when
the handler throws, so a JSON reply is documented as either of the two —
the reply's `description` is the route's:

```ts
alxia().post(
	'/orders',
	{
		body: z.object({ sku: z.string() }),
		response: {
			201: z.object({ id: z.string() }),
			400: z.object({ error: z.literal('out_of_stock') }),
		},
	},
	({ reply }) => reply(201, { id: '1' }),
);
```

```json
"400": {
  "description": "Bad request",
  "content": {
    "application/json": {
      "schema": {
        "anyOf": [
          {
            "type": "object",
            "properties": { "error": { "type": "string", "const": "out_of_stock" } },
            "required": ["error"],
            "additionalProperties": false
          },
          { "$ref": "#/components/schemas/ValidationError" }
        ]
      }
    }
  }
}
```

A `500` declared the same way is `anyOf` its schema and `InternalError`.
An own reply that is not JSON — a `z.string()`, documented as
`text/plain` — keeps its content type, and the framework's error is
documented beside it under `application/json`:

```json
"400": {
  "description": "Bad request",
  "content": {
    "text/plain": { "schema": { "type": "string" } },
    "application/json": { "schema": { "$ref": "#/components/schemas/ValidationError" } }
  }
}
```

## `detail`

`detail` does nothing at runtime; it is what the document says of the
route.

| `detail` | Type | In the operation |
| --- | --- | --- |
| `summary` | `string` | `summary` |
| `description` | `string` | `description` |
| `tags` | `readonly string[]` | `tags`, which reference pages group by |
| `deprecated` | `boolean` | `deprecated` |
| `operationId` | `string` | `operationId`, instead of the generated one |

```ts
alxia().post(
	'/users',
	{
		body: z.object({ name: z.string() }),
		detail: {
			operationId: 'createUser',
			summary: 'Create a user',
			description: 'The name must be unique.',
			tags: ['users'],
		},
	},
	({ reply }) => reply(201, { id: 1 }),
);
```

## Operation ids

Without `detail.operationId`, the id is the lowercase method followed by
each path segment capitalised: a parameter is `By<Name>`, a `*` is
`Path`, and other characters split words.

```ts
import { operationId } from '@alxia/openapi';

operationId('GET', '/users/:id');           // 'getUsersById'
operationId('DELETE', '/files/*');          // 'deleteFilesPath'
operationId('POST', '/api/password-reset'); // 'postApiPasswordReset'
```

Client generators name their functions after it, so set `operationId` on
the routes whose generated name reads badly — it then stays the same if
the path changes.

## Related

- [The document](document.md) — the options and the document around the
  operations.
- [Schemas and converters](converters.md) — how each schema above becomes
  JSON Schema.
