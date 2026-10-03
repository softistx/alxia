# @alxia/openapi

The OpenAPI 3.2 document of an [`@alxia/core`](https://www.npmjs.com/package/@alxia/core)
app, made from the schemas its routes already declare. Nothing is written
twice: the document cannot drift from the code.

```sh
bun add @alxia/openapi @alxia/core
bun add -d typescript
```

## Serving it

```ts
import { alxia } from '@alxia/core';
import { docs } from '@alxia/openapi';

const app = alxia().get(...).post(...);
app.use(docs(app, { info: { title: 'Users', version: '1.0.0' } }));
// GET /openapi.json, and an API reference page at GET /docs
```

`path` and `ui` move them, under the app's prefix; `ui: false` serves the document alone.

## Writing it

```ts
import { openapi } from '@alxia/openapi';

await Bun.write('openapi.json', JSON.stringify(openapi(app, { info }), null, 2));
```

## How a route is documented

- the path as OpenAPI writes it: `/users/:id` is `/users/{id}`, a `*` is `{path}`
- `params`, `query` and `headers` as parameters, required as their schemas say
- `body` as a JSON request body, what its schema **accepts**
- a `QUERY` route (`app.query`) as its path's `query` operation, body included
- each `response` as what its schema **gives back**, as it goes over the wire:
  (with Zod, give it `zodConverter` from `@alxia/zod`: a `Date` is then a `date-time` string)
- an event stream as `text/event-stream`, by the schema of one event, as its `itemSchema`;
  a named one, `eventStream({ state, ping })`, as a `oneOf` with an object per name —
  its `event` as a `const`, its `data`, its `id` and `retry`
- `cookies` as cookie parameters
- the 400 of a route that validates its request, and the 500 of every route —
  beside the route's own 400 or 500, when it declares one. Behind an
  `onRefusal` hook given schemas, the refusal is each status those schemas
  declare, under the hook's `contentType`, such as `application/problem+json`.
  Behind a hook without schemas, it is a `4XX` whose body is not documented
- `detail`: `summary`, `description`, `tags`, `operationId`, `deprecated`. An
  operation id is otherwise made from the method and path: `getUsersById`

Schemas convert through [Standard JSON Schema](https://standardschema.dev),
which Zod 4.2 and later, ArkType and Valibot carry: the package imports no
validator. `convert` runs first — for a vendor that carries none, or to say
more than it does; `@alxia/zod` exports one for Zod.

## From an OpenAPI document

The other direction: an OpenAPI document generates each route's method, path
and schemas, as `@nxgt/openapi-codegen`'s `alxia` option writes them (not in
a published release yet), and the handler is all you write.
[`@alxia/openapi-routes`](https://www.npmjs.com/package/@alxia/openapi-routes)
checks, in a test or at startup, that every operation has its route:

```ts
import { alxia } from '@alxia/core';
import { implemented } from '@alxia/openapi-routes';
import { operations as api } from './generated/alxia';

// pets: your own store
const app = alxia().route(api.getPet, ({ params, reply }) => {
	const pet = pets.get(params.petId); // params.petId: a number, as the spec says
	return pet ? reply.ok(pet) : reply.notFound({ title: 'No such pet' });
});
implemented(app, api); // throws, naming each operation with no route
```

## API

| export | |
| --- | --- |
| `openapi(app, options)`, `OpenApiOptions` | the document. `info`, `servers`, `convert`, `exclude` |
| `docs(app, options)`, `DocsOptions` | a plugin serving it, and a reference page. `path`, `ui` too |
| `toJsonSchema(schema, side, convert?)` | one schema as JSON Schema 2020-12 |
| `openApiPath(path)`, `operationId(method, path)` | the naming the document uses |
| `OpenApiDocument`, `OpenApiInfo`, `Operation`, `MediaType`, `JsonSchema`, `Side`, `Converter` | its types: `convert` is a `Converter`, and a `MediaType` is one entry of a body's `content` |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/openapi/docs): a page per area — the document and its options, how a route is documented, schemas and converters, and serving the document and its reference page.
- [From an OpenAPI document](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/guide/from-a-document.md): the contract first — the generated operations, `app.route()`, and the check that every operation has a route.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/troubleshooting.md): an error message, or a document that says less than your routes, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/roadmap.md): what is coming, and what is not planned.
