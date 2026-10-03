# Guide

This page covers `implemented` and `exactly`: what they take, how they
match an operation to a route, where to call them, and how to check an app
that has a prefix or routes the document does not declare.

```ts
import { alxia } from '@alxia/core';
import { exactly, implemented } from '@alxia/openapi-routes';
import { operations as api } from './generated/alxia';

export const app = alxia()
	.route(api.getPet, ({ params, reply }) => {
		const pet = pets.get(params.petId);
		return pet ? reply.ok(pet) : reply.notFound({ title: 'No such pet' });
	})
	.route(api.searchEmployees, ({ body, reply }) => reply.ok(search(body)));

implemented(app, api); // throws if an operation of the spec has no route
exactly(app, api); // and also if a route is not in the spec
```

## The signatures

```ts
function implemented(
	app: { readonly routes: readonly RouteDefinition[] },
	operations: Operations,
	options?: ImplementedOptions,
): void;

function exactly(
	app: { readonly routes: readonly RouteDefinition[] },
	operations: Operations,
	options?: ExactlyOptions,
): void;

type Operations =
	| { readonly [name: string]: RouteOperation }
	| readonly RouteOperation[];

interface ImplementedOptions {
	readonly prefix?: string;
}

interface ExactlyOptions extends ImplementedOptions {
	readonly exclude?: (route: RouteDefinition) => boolean;
}
```

Any `alxia()` app fits `app`: both read `app.routes`, every HTTP route the
app holds, groups and plugins included, with their full paths. They send
no request and start no server.

`RouteOperation` is `@alxia/core`'s, the type `app.route(operation,
handler)` reads: `{ method, path, schema? }`. So `operations` is what the
routes were declared from:

- the `operations` object of a generated `alxia.ts`, keyed by operation id.
  A message names each operation by its key. The generator's `alxia` option
  is not in a published release of `@nxgt/openapi-codegen` yet;
- a list of operations, written by hand or picked from that object. A
  message names each one by its `schema.detail.operationId`, which the
  generator always writes, or by method and path alone when it has none.
  Declare a hand-written list `as const`, or type it `RouteOperation[]`, so
  each `method` stays a `Method`.

A path is written the router's way, `/pets/:petId`, as the generator writes
it, not OpenAPI's `/pets/{petId}`: an operation written with braces matches
no route.

Both return nothing when the check passes, and throw a `TypeError` when it
does not, listing everything that is wrong at once.

## `implemented`

```text
TypeError: implemented(): 2 operations have no route: GET /pets/:petId (getPet), QUERY /employees (searchEmployees)
```

It lists each operation the app does not serve, in the order of
`operations`. Routes the document does not declare are fine: a health
check, the document's own route, an admin page.

## `exactly`

```text
TypeError: exactly(): 1 operation has no route: GET /pets/:petId (getPet); 1 route has no operation: POST /admin/reset
```

It lists the missing operations as `implemented` does, then, after a `;`,
each route of the app that no operation declares, in the order the app
declared them. Either half appears only when it lists something.

`exclude` leaves a route out of the second half. It is given the
route as `app.routes` holds it — method, full path, schema — and returns
`true` for a route the document does not have to declare:

```ts
import { docs } from '@alxia/openapi';

const served = app.use(docs(app, { info: { title: 'Pets', version: '1.0.0' } }));

exactly(served, api, {
	// docs serves the document and its page; /health is for the load balancer
	exclude: (route) =>
		['/openapi.json', '/docs', '/health'].includes(route.path),
});
```

`exclude` is not consulted for the first half: an operation with no route
is always listed.

## How a route is matched

An operation is served by a route of the same method and path:

- **The path's shape.** A parameter's name does not count:
  `app.get('/pets/:id', …)` serves the operation `GET /pets/:petId`, since
  the router sends them the same requests. The route's handler still reads
  `params.id`, not `params.petId`; declaring it with
  `app.route(api.getPet, …)` keeps the spec's names and schemas.
- **`HEAD`.** The core answers `HEAD` with the `GET` route, so a `HEAD`
  operation is served by a `GET` route at its path. `exactly` still lists
  that `GET` route when no operation declares it.
- **Every other method stands alone.** A `POST /employees` route does not
  serve a `QUERY /employees` operation.
- **Socket routes are not read.** `app.ws` routes live in `app.sockets`,
  and an OpenAPI operation is HTTP: `exactly` never lists them.

Only the method and the path are compared. A route declared with
`app.route(operation, handler)` reads its schemas from the operation, so
they cannot differ from the spec's; one written by hand is the app's to
keep in step.

## Under a prefix

`app.routes` holds full paths, so an app made with `alxia({ prefix: '/api' })`
serves `api.getPet` at `GET /api/pets/:petId`. The operations are written
without it, as the document's paths are. Give the prefix, and each operation
is looked up under it, as the core joins them (`/` under `/api` is `/api`):

```ts
const app = alxia({ prefix: '/api' }).route(api.getPet, getPet);

implemented(app, api, { prefix: '/api' });
```

Write the prefix as the app's: a leading `/` and no trailing one. `'api'`
does not compile, and `'/api/'` throws
[`implemented(): the prefix "/api/" must start with "/" and not end with one`](troubleshooting.md#typeerror-implemented-the-prefix--must-start-with--and-not-end-with-one).

The messages then name the full paths, `GET /api/pets/:petId (getPet)`,
since those are what the app is missing. For operations served under a
group, `alxia().group('/v1', …)`, give the group's prefix the same way. A
call takes one prefix: check each group's operations in a call of their
own, and use `exactly` only when every route of the app is under that
prefix, or excluded.

## Where to call it

**In a test**, the usual place: the suite fails, naming every missing route,
before a client meets a 404.

```ts
// app.spec.ts
import { test } from 'bun:test';
import { implemented } from '@alxia/openapi-routes';
import { app } from './app';
import { operations } from './generated/alxia';

test('every operation of the spec is served', () => {
	implemented(app, operations);
});
```

**At startup**, with the package installed as a dependency rather than a
dev dependency, once every route is declared and before `listen`, to refuse
to start a server that does not serve its spec. It runs once, over the
routes, and costs nothing per request:

```ts
implemented(app, operations);
app.listen(3000);
```

Call it after the last `route`, `use` and `group`: a route declared later is
not in `app.routes` yet.

## What it cannot see

- **An operation the generator left out.** `@nxgt/openapi-codegen` skips an
  operation alxia cannot route or validate yet — a `TRACE`, a binary body,
  JSON Lines — with an `ignored` warning, and it is not in `operations`.
  Read the generator's warnings: the check only knows the operations it is
  given.
- **A route that answers 404 on purpose.** A route is served if it is
  declared; what its handler does is the specs' to check.
