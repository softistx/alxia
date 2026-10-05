# Troubleshooting

Each entry is headed by the text you see: a `TypeError` one of the checks
threw, a line `nxgt-openapi generate` printed, or an error from `tsc`. The counts, methods and paths in a message
are the app's own, written `…` below. A check that passes when you expected
it to fail prints nothing; those are under [Traps](#traps), by symptom.

**Thrown**

- [`TypeError: implemented(): … operations have no route: …`](#typeerror-implemented--operations-have-no-route-)
- [`TypeError: matchesSpec(): … routes have no operation: …`](#typeerror-matchesspec--routes-have-no-operation-)
- [`TypeError: implemented(): the prefix "…" must start with "/" and not end with one`](#typeerror-implemented-the-prefix--must-start-with--and-not-end-with-one)
- [`TypeError: implemented(): "…": ":…" is not a parameter name`](#typeerror-implemented---is-not-a-parameter-name)

**API docs**

- [`TypeError: apiDocs(): cannot read the spec "…"`](#typeerror-apidocs-cannot-read-the-spec-)
- [`TypeError: apiDocs(): the path "…" must start with "/" and not end with one`](#typeerror-apidocs-the-path--must-start-with--and-not-end-with-one)
- [The page is blank, and the console reports a blocked script](#the-page-is-blank-and-the-console-reports-a-blocked-script)
- [`matchesSpec(): … routes have no operation: GET /docs, …`](#matchesspec--routes-have-no-operation-get-docs-)

**Generator** (`@nxgt/openapi-codegen` 0.7.0)

- [`alxia.ts leaves it out. … [ignored]`](#alxiats-leaves-it-out--ignored)
- [A cookie parameter is missing from `types.ts` and the client files](#a-cookie-parameter-is-missing-from-typests-and-the-client-files)
- [A client refuses alxia's 400, or types it `{ status, message, timestamp, issues }`](#a-client-refuses-alxias-400-or-types-it--status-message-timestamp-issues-)
- [A test through the client sends a request to a real address](#a-test-through-the-client-sends-a-request-to-a-real-address)

**Types**

- [`Type '"TRACE"' is not assignable to type 'Method'`](#type-trace-is-not-assignable-to-type-method)
- [``Type '"pets"' is not assignable to type '`/${string}`'``](#type-pets-is-not-assignable-to-type-string)
- [`Argument of type '{ method: string; path: string; }[]' is not assignable to parameter of type 'Operations'`](#argument-of-type--method-string-path-string--is-not-assignable-to-parameter-of-type-operations)
- [`Property 'routes' is missing in type '…' but required in type '{ readonly routes: readonly RouteDefinition[]; }'`](#property-routes-is-missing-in-type--but-required-in-type--readonly-routes-readonly-routedefinition-)
- [`Module '"@alxia/openapi"' has no exported member 'docs'`](#module-alxiaopenapi-has-no-exported-member-docs)

**Traps**

- [Every operation is listed, though the app serves them](#every-operation-is-listed-though-the-app-serves-them)
- [An operation of the spec is never listed](#an-operation-of-the-spec-is-never-listed)

## Thrown

### `TypeError: implemented(): … operations have no route: …`

Also as `1 operation has no route: …`, and as the first half of a
`matchesSpec()` message.

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
// pets, search: your own store and query
const app = alxia()
	.route(api.getPet, ({ params, reply }) => {
		const pet = pets.get(params.petId);
		return pet ? reply.ok(pet) : reply.notFound({ title: 'No such pet' });
	})
	.route(api.searchEmployees, ({ body, reply }) => reply.ok(search(body)));

implemented(app, api);
```

Call the check after the last `route`, `use`, `plugin` and `group`. If every
operation is listed, see
[Every operation is listed](#every-operation-is-listed-though-the-app-serves-them).

### `TypeError: matchesSpec(): … routes have no operation: …`

Also as `1 route has no operation: …`, after a `;` when operations are
missing too:

```text
TypeError: matchesSpec(): 1 operation has no route: GET /pets/:petId (getPet); 1 route has no operation: POST /admin/reset
```

**When:** `matchesSpec` found a route on the app that no operation declares,
named by method and full path.

**Why:** the route is not in the spec — an admin route, a health check, the
pages of a React Router app, an `app.static('/assets', …)` mount
(`GET /assets/*`) — or the spec's operation was renamed or removed and the
route was not.

**Fix:** add the operation to the document and generate again, remove the
route, or leave it out on purpose with `exclude`:

```ts
matchesSpec(app, api, {
	exclude: (route) => route.path === '/health' || route.path.startsWith('/assets/'),
});
```

If only the routes that need no operation are listed, `implemented` may be
the check you want.

### `TypeError: implemented(): the prefix "…" must start with "/" and not end with one`

Also as `matchesSpec(): the prefix "…" …`.

```text
TypeError: implemented(): the prefix "/api/" must start with "/" and not end with one
```

**When:** `prefix` ends with `/`, or is `/` alone; leave it out for an app
with no prefix. One without a leading `/` does not
[compile](#type-pets-is-not-assignable-to-type-string).

**Why:** the prefix is the app's, which the core refuses written that way
(`The prefix "…" must start with "/" and not end with one`); looked up as
given, it would name `/api//pets/:petId`, and every operation would be
reported missing.

**Fix:** write it as the app's: `{ prefix: '/api' }`.

### `TypeError: implemented(): "…": ":…" is not a parameter name`

Also as `matchesSpec(): …`, and with any other
message the core throws for a route path:
`The route path "…" must start with "/"`, `"…": "*" may only end a path`,
`"…" declares ":…" twice`, `"…": ":" may only start a segment, as a
parameter`, `"…": "*" may only be a whole segment, as a wildcard`,
`"…": "…" is a dot segment, which a request's URL never keeps`,
`"…" is not encoded as a request's URL carries it: declare "…"`.

```text
TypeError: implemented(): "/pets/:pet-id": ":pet-id" is not a parameter name
```

**When:** an operation's path is one no route may be declared at: a
parameter that is not an identifier, a `*` before the last segment, a name
given twice, a `:` or a `*` inside a segment (`/at/10:45`), a dot segment,
a literal not percent-encoded as a URL carries it (`/café`).

**Why:** an operation is matched by its shape, which the core's `shapeOf`
reads as the router does, and it refuses such a path as `app.route` would.
No route could serve it, so the check throws, naming the path and the
core's reason, rather than list it.

**Fix:** rename the parameter in the operation, as the route that serves it
must: `/pets/:petId`. A generator writing `operations` from a document turns
`{pet-id}` into a name the core accepts. For the other messages, write
the path as the core's entry for it says: a `:time` parameter for
`/at/10:45`
([`":" may only start a segment`](https://github.com/softistx/alxia/blob/develop/packages/core/docs/troubleshooting.md#--may-only-start-a-segment-as-a-parameter)),
`/caf%C3%A9` for `/café`
([`is not encoded as a request's URL carries it`](https://github.com/softistx/alxia/blob/develop/packages/core/docs/troubleshooting.md#-is-not-encoded-as-a-requests-url-carries-it-declare-)).

## API docs

### `TypeError: apiDocs(): cannot read the spec "…"`

```text
TypeError: apiDocs(): cannot read the spec "openapi.yaml" (ENOENT), looked up from the working directory /srv/app
```

**When:** the app starts, or `apiDocs` is called, and `spec` is a path that
is not a readable file.

**Why:** a relative path is looked up from the working directory of the
process, not from the file that calls `apiDocs`: `bun run src/server.ts`
from another folder, or a container whose image holds `dist/` alone, does
not see `openapi.yaml`.

**Fix:** give a path that holds wherever the app runs, or load the document
where it can be found and give the object:

```ts
import spec from '../openapi.json'; // bundled with the app
apiDocs({ spec });
// or, from this file's folder:
apiDocs({ spec: new URL('../openapi.yaml', import.meta.url).pathname });
```

The same error says `is not an OpenAPI document` for a file with no
`openapi` version, and `neither valid YAML nor valid JSON` for one that does
not parse. With `enabled: false` nothing is read.

### `TypeError: apiDocs(): the path "…" must start with "/" and not end with one`

Also `apiDocs(): ui "…" is not "scalar" or "swagger"`.

**When:** `path` is `docs` or `/docs/`, or `ui` is another name.

**Fix:** `apiDocs({ spec, path: '/docs', ui: 'scalar' })`.

### The page is blank, and the console reports a blocked script

```text
Refused to load the script 'https://cdn.jsdelivr.net/npm/@scalar/api-reference@…' because it violates the following Content Security Policy directive: "script-src 'self'"
```

**Symptom:** `/docs` answers 200 and the page stays empty.

**Why:** the response carries a policy that is not the page's. The page
sets its own `Content-Security-Policy`, which `secureHeaders` keeps, so
this is a policy set by a proxy or a CDN in front of the app, or by a
middleware that replaces the header after the page set it.

**Fix:** let the policy of the page through: `curl -I /docs` should show
`script-src https://cdn.jsdelivr.net 'nonce-…'`. If it must be your own,
allow `https://cdn.jsdelivr.net` for `script-src` and `style-src`,
`'unsafe-inline'` for `style-src`, and `'self'` for `connect-src`.

### `matchesSpec(): … routes have no operation: GET /docs, …`

**When:** the message lists the docs routes.

**Why:** `matchesSpec` leaves out the routes `apiDocs` declared, by their
handlers. A route declared by hand at `/docs`, or by a copy of
`@alxia/openapi` the check does not share (two versions installed), is not
recognised.

**Fix:** one version of `@alxia/openapi` (`bun why @alxia/openapi`), or
`matchesSpec(app, operations, { exclude: (r) => r.path.startsWith('/docs') })`.

## Generator

These come from `bunx nxgt-openapi generate`, with `alxia: true`, before
any check runs. Its guide lists every
[diagnostic](https://github.com/softistx/nxgt-http/blob/develop/packages/openapi-codegen/docs/guide/diagnostics.md).

### `alxia.ts leaves it out. … [ignored]`

```text
warning openapi.yaml#/paths/~1feed/get: watchFeed: alxia.ts leaves it out. Its 200 reply streams the event `ping` with text data [ignored]
```

**When:** a reply is `text/event-stream` whose event has text data, or
whose `itemSchema` names no events, so each event's data is not JSON.

**Why:** the generated `eventStream({ name: schema })` sends each event's
data as JSON, so 0.7.0 leaves the operation out of `alxia.ts` rather than
type it wrongly. It is not in `operations`, so `implemented` does not list
it either. Named events whose data is JSON are generated.

**Fix:** give each event's data `contentMediaType: application/json` and a
`contentSchema` in the spec, as below, or declare the route by hand, with
`eventStream` from `@alxia/core`, which takes a schema per event name
([server-sent events](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/server-sent-events.md)).

```yaml
text/event-stream:
  itemSchema:
    type: object
    properties:
      event: { const: tick }
      data:
        contentMediaType: application/json
        contentSchema: { $ref: '#/components/schemas/Tick' }
```

Other `ignored` warnings — a `TRACE`, a binary body, a binary, JSON Lines
or form reply — mean the same: declare the route by hand if you serve it.

### A cookie parameter is missing from `types.ts` and the client files

```text
warning openapi.yaml#/paths/~1me/get: getMe: types.ts, zod.ts, operations.ts and paths.ts leave out its cookie `session`: a client does not set cookies, the browser or its cookie jar sends them [ignored]
```

**Symptom:** an operation declares a parameter `in: cookie`, and the
generator warns `ignored`; the parameter is not in `types.ts`, `zod.ts`,
`operations.ts` or `paths.ts`.

**Why:** a client does not set cookies, so only `alxia.ts` validates the
parameter, as `cookies`. Before 0.7.0 the generator refused the whole
document instead.

**Fix:** none: the route's handler reads the validated `cookies`.

```ts
app.route(operations.getMe, ({ cookies, reply }) => reply.ok(findUser(cookies.session)));
```

### A client refuses alxia's 400, or types it `{ status, message, timestamp, issues }`

**Symptom:** a client generated from the document fails to decode a 400,
or its type says the body is `ValidationErrorBody`, with `status`,
`message` and `timestamp`.

**Why:** `validationErrors` defaults to `true`, which declares
`@nxgt/openapi-hono`'s 400 in `types.ts`, `zod.ts`, `operations.ts` and
`paths.ts`. alxia answers `{ error: 'validation', issues }` instead.

**Fix:** set `validationErrors: false`, declare alxia's 400 in the spec
([Spec first](guide/spec-first.md#declare-alxias-own-400)), and generate
again:

```ts
export default defineConfig({
	input: 'openapi.yaml',
	output: 'src/generated',
	alxia: true,
	validationErrors: false,
});
```

### A test through the client sends a request to a real address

**Symptom:** a test using `createClient<paths>({ baseUrl })` fails with
`ConnectionRefused` or `Unable to connect`, or reaches a server that is
running.

**Why:** no `fetch` was given, so openapi-fetch uses the global one and sends
the request over the network. The app is called in process only when the
client's `fetch` is `app.fetch`.

**Fix:** pass it, and `baseUrl` stays a name nothing answers to:

```ts
const api = createClient<paths>({
  baseUrl: 'http://alxia.test',
  fetch: (request) => app.fetch(request),
});
```

See [Testing with the generated client](guide/testing.md).

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

Also as ``Type '"api"' is not assignable to type '`/${string}`'`` for a
`prefix`.

**When:** an operation's `path`, or `prefix`, does not start with `/`.

**Fix:** write it as the route would: `{ method: 'GET', path: '/pets' }`,
and the prefix as the app's: `{ prefix: '/api' }`.

### `Argument of type '{ method: string; path: string; }[]' is not assignable to parameter of type 'Operations'`

```text
error TS2345: Argument of type '{ method: string; path: string; }[]' is not assignable to parameter of type 'Operations'.
  Type '{ method: string; path: string; }[]' is not assignable to type '{ readonly [name: string]: RouteOperation; }'.
    Index signature for type 'string' is missing in type '{ method: string; path: string; }[]'.
```

**When:** a list of operations written by hand, in a variable of its own,
without `as const`.

**Why:** TypeScript widens each `method` to `string` and each `path` to
`string`, and a `RouteOperation` needs a `Method` and a path starting with
`/`.

**Fix:** keep the literals:

```ts
import type { RouteOperation } from '@alxia/core';

const ops = [{ method: 'GET', path: '/pets' }] as const;
// or: const ops: RouteOperation[] = [{ method: 'GET', path: '/pets' }];
implemented(app, ops);
```

### `Property 'routes' is missing in type '…' but required in type '{ readonly routes: readonly RouteDefinition[]; }'`

```text
error TS2345: Argument of type '{ readonly getPet: …; }' is not assignable to parameter of type '{ readonly routes: readonly RouteDefinition[]; }'.
  Property 'routes' is missing in type '{ readonly getPet: …; }' but required in type '{ readonly routes: readonly RouteDefinition[]; }'.
```

**When:** the first argument is not an app: often the operations and the
app given in the wrong order, `implemented(operations, app)`.

**Fix:** the app first: `implemented(app, operations)`.

### `Module '"@alxia/openapi"' has no exported member 'docs'`

```text
error TS2305: Module '"@alxia/openapi"' has no exported member 'docs'.
```

Also for `openapi`, `toJsonSchema`, `Converter`, `openApiPath` and the other
exports of `@alxia/openapi` 0.3 or earlier.

**When:** code written for `@alxia/openapi` 0.1 to 0.3, after installing
0.4 or later.

**Why:** that package wrote a document from the app, and is retired: alxia
is spec first, and the name now belongs to the package that checks an app
against its document.

**Fix:** write the document, generate the operations from it, and check
the app with `matchesSpec`, as
[Coming from `@alxia/openapi` 0.3](https://github.com/softistx/alxia/blob/develop/packages/openapi/README.md#coming-from-alxiaopenapi-03-or-alxiaopenapi-routes)
says: the document the old package served, saved as a file, is a good
start for your own.

## Traps

### Every operation is listed, though the app serves them

**Symptom:** the message lists every operation, with paths that look right.

**Why:** the app has a prefix, `alxia({ prefix: '/api' })`, so it serves
`GET /api/pets/:petId`, and the operation's `/pets/:petId` is not there.

Or the operations were written by hand with OpenAPI's braces,
`/pets/{petId}`, which no route matches: the router's paths read
`/pets/:petId`.

**Fix:** give the prefix, written as the app's, a leading `/` and no
trailing one:

```ts
implemented(app, api, { prefix: '/api' });
```

The message then names the full paths, `GET /api/pets/:petId`. For a
hand-written operation, write its path `/pets/:petId`.

### An operation of the spec is never listed

**Symptom:** a route the spec declares is missing, and the check passes.

**Why:** the operation is not in `operations`. `@nxgt/openapi-codegen`
leaves out what alxia cannot route or validate yet — a `TRACE`, a binary
body, JSON Lines, events with text data — with an `ignored` warning
([one of them](#alxiats-leaves-it-out--ignored)). The check only knows the
operations it is given.

**Fix:** read the generator's warnings, and declare such a route by hand
with a route method.
