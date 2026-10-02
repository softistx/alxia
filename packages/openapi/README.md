# @alxia/openapi

The OpenAPI 3.1 document of an [`@alxia/core`](https://www.npmjs.com/package/@alxia/core)
app, made from the schemas its routes already declare. Nothing is written
twice: the document cannot drift from the code.

```sh
bun add @alxia/openapi
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
- each `response` as what its schema **gives back**, as it goes over the wire:
  (with Zod, give it `zodConverter` from `@alxia/zod`: a `Date` is then a `date-time` string)
- an event stream as `text/event-stream`, by the schema of one event
- `cookies` as cookie parameters
- the 400 of a route that validates its request, and the 500 of every route —
  beside the route's own 400 or 500, when it declares one
- `detail`: `summary`, `description`, `tags`, `operationId`, `deprecated`. An
  operation id is otherwise made from the method and path: `getUsersById`

Schemas convert through [Standard JSON Schema](https://standardschema.dev),
which Zod 4.2 and later, ArkType and Valibot carry: the package imports no
validator. `convert` runs first — for a vendor that carries none, or to say
more than it does; `@alxia/zod` exports one for Zod.

## API

| export | |
| --- | --- |
| `openapi(app, options)`, `OpenApiOptions` | the document. `info`, `servers`, `convert`, `exclude` |
| `docs(app, options)`, `DocsOptions` | a plugin serving it, and a reference page. `path`, `ui` too |
| `toJsonSchema(schema, side, convert?)` | one schema as JSON Schema 2020-12 |
| `openApiPath(path)`, `operationId(method, path)` | the naming the document uses |
| `OpenApiDocument`, `OpenApiInfo`, `Operation`, `JsonSchema`, `Side`, `Converter` | its types: `convert` is a `Converter` |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/openapi/docs): a page per area — the document and its options, how a route is documented, schemas and converters, and serving the document and its reference page.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/troubleshooting.md): an error message, or a document that says less than your routes, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/roadmap.md): what is coming, and what is not planned.
