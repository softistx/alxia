# Troubleshooting

Each entry is headed by the text you see: the `message` of an issue in a
route's `400`, an error from `tsc`, or, for a trap that prints nothing, what
you notice. A `400` from validation reads like this, and the heading is its
`message`:

```json
{
	"error": "validation",
	"issues": [{ "target": "query", "path": ["page"], "code": "invalid_format", "message": "Expected a number" }]
}
```

**A `400` from validation**

- [`Expected a number`](#expected-a-number)
- [`Expected an integer`](#expected-an-integer)
- [`Expected true, false, 1 or 0`](#expected-true-false-1-or-0)
- [`Expected an ISO 8601 date or date-time`](#expected-an-iso-8601-date-or-date-time)
- [`Expected JSON`](#expected-json)
- [`Invalid input: expected number, received string`](#invalid-input-expected-number-received-string)
- [`Invalid input: expected array, received string`](#invalid-input-expected-array-received-string)

**Wrong values, no error**

- [`?draft=false` reads `true`](#draftfalse-reads-true)
- [A typed client accepts anything for a key](#a-typed-client-accepts-anything-for-a-key)

**Types**

- [`Expected 1 arguments, but got 0.`](#expected-1-arguments-but-got-0)

**The OpenAPI document**

- [A route documents no query parameter](#a-route-documents-no-query-parameter)
- [A response is documented as `{}`](#a-response-is-documented-as-)

## A `400` from validation

### `Expected a number`

**When:** a key read by `zq.number()` or `zq.int()` is given text that is
not a number: `/items/abc`, `?page=`, `?limit=0x10`, `?n=Infinity`. Or an
item of a `zq.array(zq.int())` is: `?ids=x` reports it on the key, path
`["ids"]`; `?ids=1&ids=x` at the item's index, path `["ids", 1]`.

**Why:** the coercion accepts a number, or the text of one — digits, with
an optional sign, decimal point and exponent — and nothing else. An empty
value is refused rather than read as `0`.

**Fix:** send a number. When the key is optional, leave it out rather than
sending it empty:

```ts
const query = new URLSearchParams(input.value === '' ? {} : { page: input.value });
await fetch(`/items?${query}`);
```

If the key is not a number at all — a slug, an id with letters — it is a
`z.string()`, not a coercion.

### `Expected an integer`

**When:** `zq.int()` is given a number with a fraction: `?page=1.5`.

**Why:** `zq.int()` reads the number, then refuses anything but an integer.

**Fix:** send an integer, or accept fractions with `zq.number()`:

```ts
const query = z.object({ page: zq.int(), price: zq.number() });
```

### `Invalid input: expected number, received string`

**When:** a key in `params`, `query`, `headers` or `cookies` is a plain
`z.number()` — or a `z.array(z.number())`. Or a hand-written URL repeats a
key read by `zq.json(z.array(z.number()))`: `?ids=1&ids=2`, path
`["ids", 0]`.

**Why:** everything in a URL, a header or a cookie is text, and
`z.number()` refuses text. A client typed by the schema's input is happy,
since that input is a `number`, so the error only shows at run time. A
repeated key is a list of texts, `'1'` and `'2'`, not JSON, so `zq.json`
hands them to the schema as they are: send the array as its JSON text,
`?ids=[1,2]`.

**Fix:** use the coercion, and `zq.array` for a list:

```ts
const query = z.object({
	min: zq.number(),
	ids: zq.array(zq.int()),
});
```

### `Invalid input: expected array, received string`

**When:** a list is a `z.array(...)`, and the key is given once:
`?tag=a`.

**Why:** the query string reads a key given once as a string, and a key
given more than once as an array. `z.array` accepts only the second, so a
list of one is refused.

**Fix:**

```ts
const query = z.object({ tag: zq.array(z.string()) }); // ?tag=a → ['a'], ?tag=a&tag=b → ['a', 'b']
```

### `Expected true, false, 1 or 0`

**When:** `zq.boolean()` is given anything but `true`, `false`, `'true'`,
`'false'`, `'1'` or `'0'`: `?draft=yes`, `?draft=TRUE`, `?draft=on`, or
`?draft=` with no value. An HTML checkbox sends `on`. In a
`zq.array(zq.boolean())`, the issue is on the key, without the index of the
refused item, whether the key was given once or more.

**Why:** the four texts are the only ones read; anything else is refused,
not guessed.

**Fix:** send one of the four — a boolean as `'true'` or `'false'`. For a checkbox in a form, read its presence instead:

```ts
const form = z.object({ draft: z.literal('on').optional().transform((value) => value === 'on') });
```

### `Expected an ISO 8601 date or date-time`

**When:** `zq.date()` is given text that is not ISO 8601 with an offset or
a date alone: `?since=2026-01-01T10:00` (what an HTML `datetime-local`
input gives), `?since=1767225600000`, `?since=tomorrow`. In a
`zq.array(zq.date())`, the issue is on the key, without the index of the
refused item, whether the key was given once or more.

**Why:** a date and time without `Z` or an offset names no instant — it
depends on a time zone the server does not know — so it is refused rather
than read in the server's zone. A timestamp and loose text are refused too.

**Fix:** send a `Date` as its `toISOString()`. A `datetime-local` value
becomes one in the browser, in the user's zone:

```ts
await fetch(`/orders?${new URLSearchParams({ since: new Date(input.value).toISOString() })}`);
```

A date alone, `?since=2026-01-01`, is accepted, and reads midnight UTC.

### `Expected JSON`

**When:** a key read by `zq.json(schema)` is given text that is not JSON:
`?filter={`, `?filter=min:3`, or `?ids=x` for a `zq.json(z.array(...))`.
Or `schema` is a `z.string()`, and the client sends a plain string.

**Why:** the text is parsed with `JSON.parse` before `schema` sees it, and
text that does not parse is refused. A client sends an object as its JSON,
but a string as it is, so `zq.json(z.string())` receives `abc`, which is not
JSON; it would need `"abc"`, quotes included.

**Fix:** send the object and let the client encode it. A plain string needs
no `zq.json`:

```ts
const query = z.object({
	filter: zq.json(z.object({ min: z.number() })), // client: { filter: { min: 3 } }
	name: z.string(),                               // not zq.json(z.string())
});
```

When the JSON parses but the schema refuses it, the issue is the schema's
own, at its path inside the value: `path: ["filter", "min"]`.

## Wrong values, no error

### `?draft=false` reads `true`

**When:** a flag is a `z.coerce.boolean()`.

**Why:** `z.coerce.boolean()` is `Boolean(value)`, and every non-empty
string is truthy, `'false'` and `'0'` included.

**Fix:**

```ts
const query = z.object({ draft: zq.boolean().default(false) }); // 'false' and '0' read false
```

### A typed client accepts anything for a key

**When:** a key is a `z.coerce.number()`, `z.coerce.boolean()` or
`z.coerce.date()`. A client typed by the schema's input accepts
`{ page: 'two' }` or `{ page: {} }` without a complaint, and the server
refuses it at run time.

**Why:** a `z.coerce` schema's input is `unknown`.

**Fix:** use the `zq` coercion, whose input is the value or its text:

```ts
const params = z.object({ page: zq.int() }); // the client sends number | string
```

## Types

### `Expected 1 arguments, but got 0.`

```text
error TS2554: Expected 1 arguments, but got 0.
```

**When:** `zq.array()` or `zq.json()` with no schema.

**Why:** each wraps a schema: the item of the list, the value inside the
JSON.

**Fix:**

```ts
zq.array(z.string());
zq.json(z.object({ min: z.number() }));
```

## The OpenAPI document

### A route documents no query parameter

**When:** a route's `query`, `params`, `headers` or `cookies` schema holds a
`zq.date()`, a `z.date()`, a `z.bigint()` or a `.transform()`, and the
document is made without `convert: zodConverter`. Its `parameters` list
leaves that location out entirely, or the path parameter reads a bare
`{ "type": "string" }`.

**Why:** the default conversion asks Zod for JSON Schema, which Zod refuses
for a whole object when one field cannot be expressed. `@alxia/openapi`
then documents the schema as `{}`, with no property to make a parameter of.

**Fix:** give the converter to `openapi` and to `docs` alike:

```ts
import { docs, openapi } from '@alxia/openapi';
import { zodConverter } from '@alxia/zod';

const document = openapi(app, { info, convert: zodConverter });
app.use(docs(app, { info, convert: zodConverter }));
```

### A response is documented as `{}`

**When:** a response or body schema holds a `z.date()` or a `z.bigint()`,
anywhere inside it, and the document is made without `zodConverter`.

**Why:** the same as [above](#a-route-documents-no-query-parameter): one
field JSON Schema cannot say fails the whole schema.

**Fix:** use `convert: zodConverter`. A `Date` is then a `date-time` string,
which is what the client receives, and a `bigint` an integer. A field that
still has no JSON Schema — a `.transform()`'s output, a `z.map()` — is
documented as `{}` on its own, and the rest of the schema is kept. Document
its output with an explicit schema when it matters:

```ts
const Item = z.object({
	name: z.string().transform((name) => name.trim()).pipe(z.string()),
});
```

If every Zod schema is `{}` even with the converter, check that the app's
`zod` is 4.2 or later, the version that carries JSON Schema conversion: for
an older one, `zodConverter` leaves the schema to the default, which cannot
convert it either.
