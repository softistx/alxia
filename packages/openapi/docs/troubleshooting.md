# Troubleshooting

Each entry is headed by the text you see: a TypeError thrown when the app
is built, or a TypeScript error. `@alxia/openapi` itself throws nothing at
runtime — a schema it cannot convert is documented as `{}` — so most
problems show no message at all. Those are under [Traps](#traps), by
symptom.

**Types**

- [``Type '"openapi.json"' is not assignable to type '`/${string}`'``](#type-openapijson-is-not-assignable-to-type-string)
- [``Type '"docs"' is not assignable to type 'false | `/${string}`'``](#type-docs-is-not-assignable-to-type-false--string)
- [`Property 'version' is missing in type '{ title: string; }' but required in type 'OpenApiInfo'`](#property-version-is-missing-in-type--title-string--but-required-in-type-openapiinfo)
- [`'title' does not exist in type 'OpenApiOptions'`](#title-does-not-exist-in-type-openapioptions)
- [`Type 'null' is not assignable to type 'JsonSchema | undefined'`](#type-null-is-not-assignable-to-type-jsonschema--undefined)
- [`Object is possibly 'undefined'` on `document.paths[…]`](#object-is-possibly-undefined-on-documentpaths)
- [`Property 'GET' does not exist on type 'Partial<Record<"get" | "post" | …, Operation>>'`](#property-get-does-not-exist-on-type-partialrecordget--post---operation)

**Building the app**

- [`TypeError: GET /docs is declared twice`](#typeerror-get-docs-is-declared-twice)

**Traps**

- [Every schema in the document is `{}`](#every-schema-in-the-document-is-)
- [A reply with a `Date` is documented as `{}`](#a-reply-with-a-date-is-documented-as-)
- [A route has no parameters](#a-route-has-no-parameters)
- [A route's own 400 or 500 is not in the document](#a-routes-own-400-or-500-is-not-in-the-document)
- [The reference page finds no document on a prefixed app](#the-reference-page-finds-no-document-on-a-prefixed-app)
- [`GET /openapi.json` answers 401](#get-openapijson-answers-401)
- [A route is missing from the served document](#a-route-is-missing-from-the-served-document)
- [The reference page at `/docs` stays blank](#the-reference-page-at-docs-stays-blank)
- [A form or text body is documented as JSON](#a-form-or-text-body-is-documented-as-json)
- [WebSocket routes are not in the document](#websocket-routes-are-not-in-the-document)

## Types

These are what `tsc` prints.

### ``Type '"openapi.json"' is not assignable to type '`/${string}`'``

**When:** `docs` is given a `path` that does not start with `/`.

```text
error TS2322: Type '"openapi.json"' is not assignable to type '`/${string}`'.
```

**Why:** `path` is where the document is served, an absolute route path.

**Fix:**

```ts
app.use(docs(app, { info, path: '/openapi.json' }));
```

### ``Type '"docs"' is not assignable to type 'false | `/${string}`'``

**When:** `docs` is given a `ui` that does not start with `/`, or
`ui: true`.

```text
error TS2322: Type '"docs"' is not assignable to type 'false | `/${string}`'.
error TS2322: Type 'true' is not assignable to type 'false | `/${string}`'.
```

**Why:** `ui` is the path of the reference page, or `false` for none. The
page is served by default, so there is no `true`.

**Fix:** a path, or leave `ui` out for `/docs`
([Serving](guide/serving.md#options)):

```ts
app.use(docs(app, { info, ui: '/reference' }));
app.use(docs(app, { info })); // the page at /docs
```

### `Property 'version' is missing in type '{ title: string; }' but required in type 'OpenApiInfo'`

**When:** `openapi` or `docs` is given an `info` without `version`.

```text
error TS2741: Property 'version' is missing in type '{ title: string; }' but required in type 'OpenApiInfo'.
```

**Why:** OpenAPI requires both `info.title` and `info.version`. The
version is that of your API, a string — `version: 1` is a TS2322.

**Fix:**

```ts
openapi(app, { info: { title: 'Users', version: '1.0.0' } });
```

### `'title' does not exist in type 'OpenApiOptions'`

**When:** the title and version are given at the top level of the
options.

```text
error TS2353: Object literal may only specify known properties, and 'title' does not exist in type 'OpenApiOptions'.
```

**Why:** they belong under `info`, as in the document.

**Fix:**

```ts
openapi(app, { info: { title: 'Users', version: '1.0.0' } });
```

### `Type 'null' is not assignable to type 'JsonSchema | undefined'`

**When:** a `convert` function returns `null` for the schemas it does not
handle.

```text
error TS2322: Type 'null' is not assignable to type 'JsonSchema | undefined'.
```

**Why:** `undefined` is what lets the default conversion run. A `null`
would not, so the type refuses it.

**Fix:** return `undefined` ([Writing a `Converter`](guide/converters.md#writing-a-converter)):

```ts
const convert: Converter = (schema) => known.get(schema); // undefined when unknown
```

### `Object is possibly 'undefined'` on `document.paths[…]`

**When:** reading an operation with `noUncheckedIndexedAccess` on, as in
`document.paths['/users'].get.operationId`.

```text
error TS2532: Object is possibly 'undefined'.
```

**Why:** `paths` is a `Record<string, …>`: TypeScript cannot know a given
path is in it. Each method under a path is optional too, and so are the
replies under `responses`.

**Fix:** read every step with `?.`, and let the test fail on `undefined`:

```ts
expect(document.paths['/users']?.get?.operationId).toBe('getUsers');
```

### `Property 'GET' does not exist on type 'Partial<Record<"get" | "post" | …, Operation>>'`

**When:** reading an operation by its uppercase method.

```text
error TS2551: Property 'GET' does not exist on type 'Partial<Record<"get" | "post" | "put" | "patch" | "delete" | "options" | "head", Operation>>'. Did you mean 'get'?
```

**Why:** OpenAPI writes methods lowercase; routes declare them uppercase.

**Fix:**

```ts
document.paths['/users']?.get;
document.paths[openApiPath(route.path)]?.[route.method.toLowerCase() as 'get'];
```

## Building the app

### `TypeError: GET /docs is declared twice`

Or `TypeError: GET /openapi.json is declared twice`.

**When:** `app.use(docs(...))`, when the app already has a `GET /docs` or
`GET /openapi.json` route, when `docs` is used twice on the same app, or
when `path` and `ui` are the same path.

**Why:** `docs` declares two `GET` routes, `path` and `ui`, and an app
refuses a method and path declared twice.

**Fix:** move the plugin's routes, or turn the page off:

```ts
app.use(docs(app, { info, path: '/api-docs/openapi.json', ui: '/api-docs' }));
app.use(docs(app, { info, ui: false })); // only GET /openapi.json
```

## Traps

These print nothing: the document is made, and says less than your
routes do.

### Every schema in the document is `{}`

**When:** the document is made from schemas of a validator that carries
no Standard JSON Schema — Zod before 4.2, a library that only implements
Standard Schema's `validate`, or a schema written by hand.

**Why:** the package imports no validator. It asks each schema for its
JSON Schema through `~standard.jsonSchema`, and documents a schema that
has none as `{}`, anything.

**Fix:** upgrade Zod to 4.2 or later, or pass a `convert` that knows
your schemas ([Schemas and converters](guide/converters.md#writing-a-converter)):

```sh
bun add zod@^4.2
```

```ts
openapi(app, { info, convert: (schema) => known.get(schema) });
```

### A reply with a `Date` is documented as `{}`

**When:** a Zod schema holds a `z.date()` or a `z.bigint()`, or a reply's
schema ends in a `.transform(...)`, and no converter is given.

**Why:** Zod's conversion throws on what JSON Schema cannot describe, and
a schema whose conversion throws is documented as `{}` — the whole
schema, not only the field.

**Fix:** give `openapi` or `docs` the converter of `@alxia/zod`, which
documents a `Date` as a `date-time` string and a `bigint` as an integer
([Zod and `Date`](guide/converters.md#zod-and-date-zodconverter)):

```ts
import { zodConverter } from '@alxia/zod';

openapi(app, { info, convert: zodConverter });
```

### A route has no parameters

**When:** a route's `query`, `headers` or `cookies` schema is not a plain
object — a union of objects, a schema that converts to `{}` — and its
parameters are missing from the operation.

**Why:** parameters are read from the converted schema's `properties`.
A union has none at its top level, and nothing is guessed. Path
parameters are not affected: they come from the path.

**Fix:** declare the parameters as one object, with the optional ones
optional:

```ts
query: z.object({ email: z.string().optional(), phone: z.string().optional() }),
```

### A route's own 400 or 500 is not in the document

**When:** a route that validates its request declares a `400` in
`response`, or any route declares a `500`.

**Why:** the package documents the `400` of every validating route as
`ValidationError`, and the `500` of every route as `InternalError`, and
these replace what `response` declares for those statuses.

**Fix:** answer your own refusals with a status the package does not
write — `409` for a conflict, `422` for a request that validated but
cannot be applied:

```ts
response: { 201: User, 409: z.object({ error: z.literal('taken') }) },
```

### The reference page finds no document on a prefixed app

**When:** `docs` is used on an app made with `alxia({ prefix: '/api' })`.
The routes are served at `/api/openapi.json` and `/api/docs`, but the page
asks for `/openapi.json`, and the document lists `/api/openapi.json` and
`/api/docs` among its paths.

**Why:** `docs` writes its own path, unprefixed, into the page, and leaves
its routes out of the document by that unprefixed path.

**Fix:** mount the prefixed app in an unprefixed one, and use `docs` there
([Serving](guide/serving.md#where-to-use-it)):

```ts
const api = alxia({ prefix: '/api' }).get('/ping', ({ reply }) => reply(200, 'pong'));

const app = alxia().use(api);
app.use(docs(app, { info }));
```

### `GET /openapi.json` answers 401

**When:** `docs` is used after a hook that guards routes — a `derive`
that answers 401, a bearer-token plugin.

**Why:** the plugin's routes are routes of your app, and run every hook
declared before `use`.

**Fix:** use `docs` before the guard. The guarded routes are still
documented, since the document is made at its first request:

```ts
app.use(docs(app, { info }));
app.use(guard).get('/me', handler);
```

### A route is missing from the served document

**When:** the route was added after `/openapi.json` was first requested —
often in a test that fetches the document, then declares more routes on
the same app.

**Why:** `docs` makes the document at its first request, and serves that
same document afterwards.

**Fix:** declare every route before the first request; in a test, build a
fresh app per case.

```ts
const app = alxia().get('/a', handlerA).get('/b', handlerB);
app.use(docs(app, { info }));
await app.fetch(new Request('http://localhost/openapi.json')); // lists /a and /b
```

### The reference page at `/docs` stays blank

**When:** the browser cannot reach `cdn.jsdelivr.net` — an offline or
filtered network, a proxy that replaces the page's
`Content-Security-Policy` with a stricter one.

**Why:** the page loads [Scalar](https://scalar.com) from
`https://cdn.jsdelivr.net/npm/@scalar/api-reference`; it bundles nothing.

**Fix:** serve the document alone, and open it with a reference viewer
you host:

```ts
app.use(docs(app, { info, ui: false }));
```

### A form or text body is documented as JSON

**When:** a route's `body` is sent as a form or as text.

**Why:** the request body is always documented as `application/json`.

**Fix:** none in the document today; say it in `detail.description`:

```ts
detail: { description: 'Accepts application/x-www-form-urlencoded.' },
```

### WebSocket routes are not in the document

**When:** an app declares `app.ws(...)` routes.

**Why:** the document is made from `app.routes`, the HTTP routes;
OpenAPI 3.1 has no way to describe a WebSocket.

**Fix:** none: document them elsewhere.
