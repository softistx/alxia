# From an OpenAPI document

This page covers the other direction: the contract first. An OpenAPI
document generates each route's method, path and schemas; the app writes
only the handlers; and a test checks that every operation of the document
has its route. The rest of this guide goes from code to document; here the
document comes first, and `openapi` and `docs` still serve it back.

```ts
import { alxia } from '@alxia/core';
import { operations as api } from './generated/alxia';

// pets: your own store
export const app = alxia().route(api.getPet, ({ params, reply }) => {
	const pet = pets.get(params.petId); // a number, read from the path by the spec
	return pet ? reply.ok(pet) : reply.notFound({ title: 'No such pet' });
});
```

Three pieces make it:

| Step | Package | What it does |
| --- | --- | --- |
| [1. Generate the operations](#1-generate-the-operations) | `@nxgt/openapi-codegen`, with `alxia: true` | writes `alxia.ts`: each operation as `{ method, path, schema }`, with Zod schemas |
| [2. Declare the routes](#2-declare-the-routes) | `@alxia/core`'s `app.route()` | one route per operation: the handler is the only argument you write |
| [3. Check every operation has a route](#3-check-every-operation-has-a-route) | `@alxia/openapi-routes` | `implemented` and `matchesSpec`, in a test |

## 1. Generate the operations

[`@nxgt/openapi-codegen`](https://github.com/softistx/nxgt-http/tree/develop/packages/openapi-codegen)
reads an OpenAPI 3.1 or 3.2 document, one file or many, and writes
TypeScript types and Zod 4 validators from it. Its `alxia` option also
writes `alxia.ts`, the file this page builds on.

> **Not published yet.** The `alxia` option is merged in nxgt-http, but no
> release of `@nxgt/openapi-codegen` carries it: 0.5.1, the latest on npm,
> does not know it. Once the next release is published, install the
> generator as a dev dependency, beside `zod` (4.5.4 or later), which the
> generated code imports. Until then, the steps below are what that
> release does.

The generator runs on Bun. Its config file sits at the project root:

```ts
// openapi-codegen.config.ts
import { defineConfig } from '@nxgt/openapi-codegen';

export default defineConfig({
	input: 'openapi/openapi.yaml',
	output: 'src/generated',
	alxia: true,
});
```

```json
{
	"scripts": {
		"generate:api": "nxgt-openapi generate",
		"check:api": "nxgt-openapi generate --check"
	}
}
```

`generate:api` writes `src/generated/`; `check:api` writes nothing and
exits 1 when the generated files are stale, for CI. Besides `types.ts`,
`zod.ts`, `operations.ts` and `paths.ts`, `alxia: true` writes `alxia.ts`:
one constant per operation, named by its `operationId`, and `operations`,
all of them by `operationId`:

```ts
// src/generated/alxia.ts — generated
import { z } from 'zod';
import { zHit, zNotFound, zPet, zSearchEmployeesBody } from './zod';

export const getPet = {
	method: 'GET',
	path: '/pets/:petId', // '/pets/{petId}' in the spec
	schema: {
		params: z.object({ petId: numeric.pipe(z.int().min(1)) }), // numeric: a helper of the file, a number from its text
		response: { 200: zPet, 404: zNotFound },
		detail: { operationId: 'getPet', summary: 'Fetch a pet.' },
	},
} as const;

export const searchEmployees = {
	method: 'QUERY', // OpenAPI 3.2's query operation
	path: '/employees',
	schema: {
		body: zSearchEmployeesBody,
		response: { 200: z.array(zHit) },
		detail: { operationId: 'searchEmployees' },
	},
} as const;

export const operations = { getPet, searchEmployees } as const;
```

The file is plain data. It imports `zod` and `./zod`, plus `eventStream`
from `@alxia/core` only when an operation replies with server-sent events,
and each schema keeps its concrete Zod type, so alxia types the handler
from it. What the generator writes, part by part:

- **`method`**, uppercased, and `'QUERY'` for a `query` operation;
- **`path`**, with `{name}` written `:name`;
- **`params`, `query`, `headers`**, each read from the strings alxia hands
  over: a number from its text, a list from a key given once or several
  times, headers by lowercased name;
- **`body`**, the schema of the JSON, form or text body;
- **`response`**, per status: the schema of its JSON or text,
  `z.undefined()` for a reply with no content, `eventStream(schema)` for
  server-sent events;
- **`detail`**, the `operationId`, and the `summary`, `description`,
  `tags` and `deprecated` the spec gives. `openapi` writes them back into
  the document.

**The 400 is alxia's.** alxia answers a request the schemas refuse with its
own 400, `{ error: 'validation', issues }`, and types it itself, so the 400
of the generator's `validationErrors` option is never written into
`alxia.ts`. A 400 the spec declares is kept.

**What alxia cannot express is left out**, with an `ignored` warning from
the generator, for example a `TRACE`, a path parameter sharing its segment
with text (`/files/{name}.json`), a binary body, or a reply that is binary,
JSON Lines, a form or named events; the generator's
[`alxia.ts`](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-codegen/docs/guide/generated-code.md#alxiats)
page has the full list. Such an operation is not in `operations`; declare
its route by hand if you serve it.

The generator's guide has every option, and every file it writes:
[options](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-codegen/docs/guide/options.md#alxia)
and [`alxia.ts`](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-codegen/docs/guide/generated-code.md#alxiats).

## 2. Declare the routes

`app.route(operation, handler)` declares the route an operation describes,
exactly as `app[method](path, schema, handler)` would: the same context,
the same compile errors, the same entry in the app's types, which
`@alxia/client` reads.

```ts
// src/app.ts
import { alxia } from '@alxia/core';
import { operations as api } from './generated/alxia';

// auth, pets, search: your own hook, store and query
export const app = alxia({ prefix: '/api' })
	.use(auth)
	.route(api.getPet, ({ params, reply }) => {
		params.petId; // number
		const pet = pets.get(params.petId);
		return pet ? reply.ok(pet) : reply.notFound({ title: 'No such pet' });
	})
	.route(api.searchEmployees, ({ body, reply }) => reply.ok(search(body)));
```

- A request the schemas refuse gets the 400; the handler never runs.
- A reply the spec does not declare does not compile, `reply(201, …)` on
  `getPet` above, and one that breaks its schema is refused at run time.
- Hooks, groups and plugins apply as they do to any route: `auth` runs
  first.

See [Routes as data](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/routes.md#routes-as-data-route)
in `@alxia/core`'s guide, and
[`route() needs one method: declare the operation as const`](https://github.com/softistx/alxia/blob/develop/packages/core/docs/troubleshooting.md#route-needs-one-method-declare-the-operation-as-const)
for the one mistake a hand-written operation makes.

## 3. Check every operation has a route

Nothing above notices an operation with no route: the app compiles, and the
request gets a 404. [`@alxia/openapi-routes`](https://github.com/softistx/alxia/tree/develop/packages/openapi-routes)
does, from the same `operations`:

```sh
bun add -d @alxia/openapi-routes
```

```ts
// src/app.spec.ts
import { test } from 'bun:test';
import { exactly, implemented } from '@alxia/openapi-routes';
import { app } from './app';
import { operations } from './generated/alxia';

test('every operation of the spec is served', () => {
	implemented(app, operations, { prefix: '/api' });
});

test('and nothing else is', () => {
	matchesSpec(app, operations, {
		prefix: '/api',
		// served beside the spec: a health check, and the document itself (below)
		exclude: (route) =>
			['/api/health', '/api/openapi.json', '/api/docs'].includes(route.path),
	});
});
```

`implemented` throws, naming each operation that has no route:

```text
TypeError: implemented(): 2 operations have no route: GET /api/pets/:petId (getPet), QUERY /api/employees (searchEmployees)
```

`matchesSpec` also lists each route the spec does not declare, `exclude`
aside:

```text
TypeError: matchesSpec(): 1 route has no operation: POST /api/admin/reset
```

`prefix` is the app's own: `app.routes` holds full paths, and the
operations are written without it, as the document's paths are. Its
[guide](https://github.com/softistx/alxia/blob/develop/packages/openapi-routes/docs/guide.md)
covers how a route is matched, and calling the check at startup instead.

## Serving the document back

The routes carry the spec's schemas and `detail`, so `openapi` and `docs`
document them as any other route, with the spec's operation ids, summaries
and tags. The document they write is the app's: it says what the routes
validate, which is what the spec said, as alxia reads it.

```ts
import { docs } from '@alxia/openapi';

app.use(docs(app, { info: { title: 'Pets', version: '1.0.0' } }));
// GET /api/openapi.json, and the reference page at GET /api/docs
```

`docs` adds two routes the spec does not declare, `GET /api/openapi.json`
and `GET /api/docs`: the `exclude` of [step 3](#3-check-every-operation-has-a-route)
leaves them out.
