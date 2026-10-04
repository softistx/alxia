# The checks

This page covers `implemented` and `matchesSpec`: what they take, how they
match an operation to a route, where to call them, and how to check an app
that has a prefix, routes with middlewares, or routes the document does not
declare. Where the operations come from is [Spec first](spec-first.md).

```ts
import { alxia } from '@alxia/core';
import { implemented, matchesSpec } from '@alxia/openapi';
import { operations as api } from './generated/alxia';

// pets, search: your own store and query
export const app = alxia()
	.route(api.getPet, ({ params, reply }) => {
		const pet = pets.get(params.petId);
		return pet ? reply.ok(pet) : reply.notFound({ title: 'No such pet' });
	})
	.route(api.searchEmployees, ({ body, reply }) => reply.ok(search(body)));

matchesSpec(app, api); // throws if an operation of the spec has no route, or a route is not in the spec
// or, for an app that serves more than its spec:
implemented(app, api); // throws only if an operation of the spec has no route
```

## The signatures

```ts
function implemented(
	app: { readonly routes: readonly RouteDefinition[] },
	operations: Operations,
	options?: ImplementedOptions,
): void;

function matchesSpec(
	app: { readonly routes: readonly RouteDefinition[] },
	operations: Operations,
	options?: MatchesSpecOptions,
): void;

type Operations =
	| { readonly [name: string]: RouteOperation }
	| readonly RouteOperation[];

interface ImplementedOptions {
	readonly prefix?: RoutePath; // `/${string}`, from @alxia/core
}

interface MatchesSpecOptions extends ImplementedOptions {
	readonly exclude?: (route: RouteDefinition) => boolean;
}
```

Any `alxia()` app fits `app`: both read `app.routes`, every HTTP route the
app holds, groups and plugins included, with their full paths. They send
no request and start no server.

`RouteOperation` is `@alxia/core`'s, the type `app.route(operation,
...middlewares, handler)` reads: `{ method, path, schema? }`. So `operations` is what the
routes were declared from:

- the `operations` object of a generated `alxia.ts`, keyed by operation id
  ([Spec first](spec-first.md#2-generate-the-operations)). A message names
  each operation by its key;
- a list of operations, written by hand or picked from that object. A
  message names each one by its `schema.detail.operationId`, which the
  generator always writes, or by method and path alone when it has none.
  Declare a hand-written list `as const`, or type it `RouteOperation[]`, so
  each `method` stays a `Method`.

A path is written the router's way, `/pets/:petId`, as the generator writes
it, not OpenAPI's `/pets/{petId}`: an operation written with braces matches
no route.

Both return nothing when the check passes, and throw a `TypeError` when it
does not, listing everything that is wrong at once. An operation path no
route may be declared at — `/pets/:pet-id`, `/a/*/b` — is the exception: it
throws at once, with the core's reason for that path, since no route
could serve it ([troubleshooting](../troubleshooting.md#typeerror-implemented---is-not-a-parameter-name)).

## `implemented`

```text
TypeError: implemented(): 2 operations have no route: GET /pets/:petId (getPet), QUERY /employees (searchEmployees)
```

It lists each operation the app does not serve, in the order of
`operations`. Routes the document does not declare are fine: a health
check, a page, an admin route.

## `matchesSpec`

Called `exactly` until 0.2.0 of `@alxia/openapi-routes`: `exactly` and
`ExactlyOptions` still work, deprecated, and their messages still start
with `exactly():`.

```text
TypeError: matchesSpec(): 1 operation has no route: GET /pets/:petId (getPet); 1 route has no operation: POST /admin/reset
```

It lists the missing operations as `implemented` does, then, after a `;`,
each route of the app that no operation declares, in the order the app
declared them. Either half appears only when it lists something.

`exclude` leaves a route out of the second half. It is given the
route as `app.routes` holds it — method, full path, schema — and returns
`true` for a route the document does not have to declare:

```ts
import { isReactRouterRoute } from '@alxia/react-router';

matchesSpec(app, api, {
	// the pages a React Router app serves beside the API, and the load balancer's check
	exclude: (route) => isReactRouterRoute(route) || route.path === '/health',
});
```

`isReactRouterRoute`, from `@alxia/react-router`, is one such predicate:
`true` for the routes `reactRouter()` declared, its catch-all and the
client build's files. Any function of the route works.

`exclude` is not consulted for the first half: an operation with no route
is always listed.

## Routes with middlewares

`app.route(operation, ...middlewares, handler)`, in `@alxia/core`, gives a
route declared from an operation the middlewares of any route. The
operation's schema is two of them: a `responds` of its responses, first, and
a `validate` of its request just before the handler, so an `auth` placed
before it answers 401 before the body is read. `validate(operation)`,
given the same operation, validates where it stands instead, once. Put it
after the auth: an anonymous client then gets no body parsed, and no
validation issues back, which would reveal the schema:

```ts
import { alxia, defineMiddleware, validate } from '@alxia/core';
import { matchesSpec } from '@alxia/openapi';
import { operations as api } from './generated/alxia';

const auth = defineMiddleware(({ request, reply }, next) =>
	request.headers.has('authorization') ? next() : reply(401, { error: 'unauthorized' as const }),
);

export const app = alxia()
	.route(api.renamePet, auth, ({ params, body, reply }) => reply.ok(rename(params.petId, body.name)))
	.route(api.adoptPet, auth, validate(api.adoptPet), ({ params, reply }) => reply.created(adopt(params.petId)));

matchesSpec(app, api); // the routes are matched as any others: by method and path
```

The checks read `app.routes`, so middlewares change nothing for them. A
reply a middleware sends with a status the operation declares, such as
`auth`'s 401 when the document declares one, is checked against that
status's schema; one with a status it does not declare is sent as it is.

## How a route is matched

An operation is served by a route of the same method and path:

- **The path's shape.** A parameter's name does not count:
  `app.get('/pets/:id', …)` serves the operation `GET /pets/:petId`, since
  the router sends them the same requests. Both are compared by
  `shapeOf` from `@alxia/core`, the function the router uses itself. As in the router, a parameter
  is a whole `:name` segment, and an operation path with a `:` anywhere
  else, such as `/at/10:45`, throws the core's `TypeError`, as declaring a
  route there would. The route's handler still reads
  `params.id`, not `params.petId`; declaring it with
  `app.route(api.getPet, …)` keeps the spec's names and schemas.
- **`HEAD`.** The core answers `HEAD` with the `GET` route, so a `HEAD`
  operation is served by a `GET` route at its path. `matchesSpec` still lists
  that `GET` route when no operation declares it.
- **Every other method stands alone.** A `POST /employees` route does not
  serve a `QUERY /employees` operation.
- **Socket routes are not read.** `app.ws` routes live in `app.sockets`,
  and an OpenAPI operation is HTTP: `matchesSpec` never lists them.

Only the method and the path are compared. A route declared with
`app.route(operation, ...middlewares, handler)` reads its schemas from the operation, so
they cannot differ from the spec's; one written by hand is the app's to
keep in step.

## Under a prefix

`app.routes` holds full paths, so an app made with `alxia({ prefix: '/api' })`
serves `api.getPet` at `GET /api/pets/:petId`. The operations are written
without it, as the document's paths are. Give the prefix, and each operation
is looked up under it, joined by the core's own `joinPath` (`/` under `/api`
is `/api`):

```ts
const app = alxia({ prefix: '/api' }).route(api.getPet, getPet);

implemented(app, api, { prefix: '/api' });
```

Write the prefix as the app's: a leading `/` and no trailing one. `'api'`
[does not compile](../troubleshooting.md#type-pets-is-not-assignable-to-type-string), and `'/api/'` throws
[`implemented(): the prefix "/api/" must start with "/" and not end with one`](../troubleshooting.md#typeerror-implemented-the-prefix--must-start-with--and-not-end-with-one).

The messages then name the full paths, `GET /api/pets/:petId (getPet)`,
since those are what the app is missing. For operations served under a
group, `alxia().group('/v1', …)`, give the group's prefix the same way. A
call takes one prefix: check each group's operations in a call of their
own, and use `matchesSpec` only when every route of the app is under that
prefix, or excluded.

## Where to call it

**In a test**, the usual place: the suite fails, naming every missing route,
before a client meets a 404.

```ts
// app.spec.ts
import { test } from 'bun:test';
import { implemented } from '@alxia/openapi';
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
  JSON Lines, named server-sent events — with an `ignored` warning, and it
  is not in `operations`. Read the generator's warnings: the check only
  knows the operations it is given
  ([what the generator leaves out](spec-first.md#what-the-generator-leaves-out-060)).
- **A route that answers 404 on purpose.** A route is served if it is
  declared; what its handler does is the specs' to check.
