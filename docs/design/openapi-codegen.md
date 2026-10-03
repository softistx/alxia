# Typed routes from an OpenAPI document

Status: **approved** by the owner on 2026-10-02. Each slice below is one
PR, built in the order given at the end.

Today alxia goes from code to contract: a route declares its schemas, and
`@alxia/openapi` writes the document. This note proposes the opposite
direction, contract first. An OpenAPI document generates the routes' schemas,
and the handler is the only thing left to write. Two things inspire it:
`@nxgt/openapi-hono` in nxgt-http, and the owner's remark that "the options
will go away once routes come from codegen-alxia".

## What nxgt-http already does

- **`@nxgt/openapi-codegen`** (0.5.1, about 6,500 lines) handles the hard
  part. Its loader accepts OpenAPI 3.1 and 3.2 only, resolving `$ref`s across
  files. It builds an IR of the schemas and the operations. From that it
  emits:
  - `types.ts`: the types and indexes, `Operations` and `ClientOperations`;
  - `zod.ts`: one Zod 4 schema per type;
  - `operations.ts`: a runtime table of the operations;
  - `paths.ts`.
  It already supports `query` (in 3.2 only) and `itemSchema` (SSE and JSON
  Lines).
- **`hono: true`** adds one file, `hono.ts`, from a 231-line emitter. It
  contains the `Replies` per operation and a `createRoutes(app)` bound to the
  spec.
- **`@nxgt/openapi-hono`** (about 1,300 lines) is the runtime of that file:
  - it registers routes, written as the spec writes them (`'/pets/{petId}'`);
  - it validates with the table's Zod schemas, and answers a refused request
    with its own 400;
  - it optionally checks replies;
  - it throws at startup on an unknown, duplicated or shadowed route, and
    `assertComplete()` reports every operation that has no handler.

## What alxia needs, and what it already has

Most of openapi-hono's runtime is something an alxia route already does by
itself. A route takes `params`, `query`, `headers`, `body` and
`response` as Standard Schemas (and Zod 4 is one). Core then:
- validates the request, answering 400 `ValidationErrorBody`;
- types the context;
- refuses at compile time a reply whose status is not declared, and at
  run time a reply that breaks its schema;
- records the route in `RoutesOf<App>`, which `@alxia/client` and
  `@alxia/openapi` read.

So nothing has to be validated or typed again. What remains is a route's
options, built from the document with their concrete Zod types, plus a
check that every operation got a handler.

## Proposal

### 1. An `alxia: true` emitter in `@nxgt/openapi-codegen`

The emitter would live in nxgt-http, beside `hono.ts`, sharing its loader,
IR and `zod.ts`. It emits `alxia.ts`, which holds one constant per operation:
its method, its path written the alxia way, and its route options. Each
schema keeps its concrete type, which the erased `operations.ts` table does
not keep:

```ts
// alxia.ts — generated
import { z } from 'zod';
import { zHit, zSearchEmployeesBody, zPet } from './zod';

export const searchEmployees = {
	method: 'QUERY',
	path: '/employees',
	schema: {
		body: zSearchEmployeesBody,
		response: { 200: z.array(zHit) },
		detail: { operationId: 'searchEmployees', tags: [] },
	},
} as const;

export const getPet = {
	method: 'GET',
	path: '/pets/:petId',                      // '/pets/{petId}' in the spec
	schema: {
		params: z.object({ petId: z.coerce.number().int() }),
		response: { 200: zPet, 404: zNotFound },
		detail: { operationId: 'getPet' },
	},
} as const;

export const operations = { searchEmployees, getPet } as const;
```

The generated file imports only `zod`, and neither `@alxia/core` nor any
runtime package: it is plain data. Two mappings need care:
- **Paths:** `{id}` becomes `:id`. A path alxia cannot route is skipped with
  a warning, as `routable.ts` already does for Hono.
- **Media types:**
  - `application/json` maps to `body` and `response`.
  - `itemSchema` with `text/event-stream` maps to `eventStream(schema)`.
  - Forms and text map to `body`, which core already reads by
    `content-type`.
  - Binary, JSON Lines and several media types on one response are left for
    later. For now each becomes a warning, and the operation keeps `detail`
    only.

### 2. One method in core: `app.route(operation, handler)`

```ts
import { operations as api } from './generated/alxia';

const app = alxia()
	.use(auth)
	.route(api.searchEmployees, ({ body, reply }) => reply.ok(search(body)))
	.route(api.getPet, ({ params, reply }) => {
		const pet = pets.get(params.petId);           // number, from the spec
		return pet ? reply.ok(pet) : reply.notFound({ error: 'not_found' });
	});
```

`route({ method, path, schema }, handler)` behaves exactly like
`app[method](path, schema, handler)`, with the same types and the same
`RoutesOf`. The handler is then the only argument the user writes, which is
how the options "go away". The method is about ten lines, a dispatch to
`#method`, and does not depend on OpenAPI. It also serves a route declared as
data by hand.

### 3. A small `@alxia/openapi-routes` in alxia, for completeness

This package holds only the part core should not know:
- `implemented(app, operations)` throws, listing each operation of the spec
  that has no route on `app`, keyed by method and path. A test or startup
  calls it, as openapi-hono's `assertComplete()` does.
- `exactly(app, operations)` throws the same way, and also lists each route
  of `app` that the spec does not declare.

It reads `app.routes` and nothing else. It is about 60 lines, plus its
specs.

## Decisions to make

1. **Validation 400s.** Core answers a refused request with
   `{ error: 'validation', issues }`, and openapi-hono with
   `{ status, message, timestamp, issues }`. The `validationErrors` option
   of openapi-codegen already declares the runtime's 400 on each operation.
   For `alxia: true`, it should declare core's `ValidationErrorBody` instead,
   so that a client checking its replies accepts it. This is my
   recommendation.
2. **Where the emitter lives.** I recommend nxgt-http, because one loader
   and one IR serve Hono, alxia, msw, nuxt and httpyz. The alternative is a
   generator in alxia, which would mean about 6,000 more lines here and would
   drift from the shared one.
3. **`route()` in core, or `operation(app, …)` in the package?** A function
   outside core breaks the `.get().post()` chain, which is the way alxia
   collects route types. So I recommend `route()` in core.
4. **The client.** `@alxia/client` already types itself from `RoutesOf`,
   so nothing changes there. openapi-httpyz's table client is not affected
   either.

## Slices

1. **alxia:** `app.route(operation, handler)` in core, with its specs and
   docs. It can be merged on its own.
2. **nxgt-http:** the `alxia: true` emitter in `@nxgt/openapi-codegen`, its
   fixtures and a spec that serves each fixture with a real alxia app. This
   is in another repository, and its PR follows that repository's own rules
   and approvals.
3. **alxia:** `@alxia/openapi-routes` (`implemented`, `exactly`), plus a
   "From an OpenAPI document" guide page in `@alxia/openapi`.
