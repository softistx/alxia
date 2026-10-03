# Troubleshooting

Each entry is headed by the text you see: a `TypeError` one of the checks
threw, or an error from `tsc`. The counts, methods and paths in a message
are the app's own, written `…` below. A check that passes when you expected
it to fail prints nothing; those are under [Traps](#traps), by symptom.

**Thrown**

- [`TypeError: implemented(): … operations have no route: …`](#typeerror-implemented--operations-have-no-route-)
- [`TypeError: exactly(): … routes have no operation: …`](#typeerror-exactly--routes-have-no-operation-)

**Types**

- [`Type '"TRACE"' is not assignable to type 'Method'`](#type-trace-is-not-assignable-to-type-method)
- [``Type '"pets"' is not assignable to type '`/${string}`'``](#type-pets-is-not-assignable-to-type-string)
- [`Property 'routes' is missing in type '…' but required in type '{ readonly routes: readonly RouteDefinition[]; }'`](#property-routes-is-missing-in-type--but-required-in-type--readonly-routes-readonly-routedefinition-)

**Traps**

- [Every operation is listed, though the app serves them](#every-operation-is-listed-though-the-app-serves-them)
- [An operation of the spec is never listed](#an-operation-of-the-spec-is-never-listed)

## Thrown

### `TypeError: implemented(): … operations have no route: …`

Also as `1 operation has no route: …`, and as the first half of an
`exactly()` message.

```text
TypeError: implemented(): 2 operations have no route: GET /pets/:petId (getPet), QUERY /employees (searchEmployees)
```

**When:** an operation of `operations` has no route of its method and path
on the app. Each is named by method, the full path looked up, and its
operation id, its key in the object, or `schema.detail.operationId` in a
list.

**Why:** nobody declared it yet, it is declared under another method, or it
is declared after the check ran.

**Fix:** declare each one from its operation:

```ts
const app = alxia()
	.route(api.getPet, ({ params, reply }) => reply.ok(pets.get(params.petId)))
	.route(api.searchEmployees, ({ body, reply }) => reply.ok(search(body)));

implemented(app, api);
```

Call the check after the last `route`, `use` and `group`. If every
operation is listed, see
[Every operation is listed](#every-operation-is-listed-though-the-app-serves-them).

### `TypeError: exactly(): … routes have no operation: …`

Also as `1 route has no operation: …`, and after a `;` when operations are
missing too:

```text
TypeError: exactly(): 1 operation has no route: GET /pets/:petId (getPet); 1 route has no operation: POST /admin/reset
```

**When:** `exactly` found a route on the app that no operation declares,
named by method and full path.

**Why:** the route is not in the spec — an admin route, a health check, the
routes `docs()` from `@alxia/openapi` adds (`GET /openapi.json`,
`GET /docs`), a `static()` mount (`GET /assets/*`) — or the spec's
operation was renamed or removed and the route was not.

**Fix:** add the operation to the document and generate again, remove the
route, or leave it out on purpose with `exclude`:

```ts
exactly(app, api, {
	exclude: (route) =>
		['/openapi.json', '/docs', '/health'].includes(route.path),
});
```

If only the routes that need no operation are listed, `implemented` may be
the check you want.

## Types

### `Type '"TRACE"' is not assignable to type 'Method'`

```text
error TS2322: Type '"TRACE"' is not assignable to type 'Method'.
```

**When:** an operation has a method alxia cannot route.

**Why:** each operation is a `RouteOperation`, whose `method` is one the
core serves: `GET`, `POST`, `PUT`, `PATCH`, `DELETE`, `OPTIONS`, `HEAD` or
`QUERY`. The generator leaves a `TRACE` out of `alxia.ts` for that reason.

**Fix:** remove the operation from the list; no app can serve it.

### ``Type '"pets"' is not assignable to type '`/${string}`'``

```text
error TS2322: Type '"pets"' is not assignable to type '`/${string}`'.
```

**When:** an operation's `path` does not start with `/`.

**Fix:** write it as the route would: `{ method: 'GET', path: '/pets' }`.

### `Property 'routes' is missing in type '…' but required in type '{ readonly routes: readonly RouteDefinition[]; }'`

```text
error TS2345: Argument of type '{ readonly getPet: …; }' is not assignable to parameter of type '{ readonly routes: readonly RouteDefinition[]; }'.
```

**When:** the first argument is not an app: often the operations and the
app given in the wrong order, `implemented(operations, app)`.

**Fix:** the app first: `implemented(app, operations)`.

## Traps

### Every operation is listed, though the app serves them

**Symptom:** the message lists every operation, with paths that look right.

**Why:** the app has a prefix, `alxia({ prefix: '/api' })`, so it serves
`GET /api/pets/:petId`, and the operation's `/pets/:petId` is not there.

**Fix:** give the prefix:

```ts
implemented(app, api, { prefix: '/api' });
```

The message then names the full paths, `GET /api/pets/:petId`.

### An operation of the spec is never listed

**Symptom:** a route the spec declares is missing, and the check passes.

**Why:** the operation is not in `operations`. `@nxgt/openapi-codegen`
leaves out what alxia cannot route or validate yet — a `TRACE`, a binary
body, JSON Lines — with an `ignored` warning. The check only knows the
operations it is given.

**Fix:** read the generator's warnings, and declare such a route by hand
with a route method.
