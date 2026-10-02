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
- [`Invalid input: expected int, received number`](#invalid-input-expected-int-received-number)
- [`Invalid input: expected number, received string`](#invalid-input-expected-number-received-string)
- [`Invalid input: expected array, received string`](#invalid-input-expected-array-received-string)
- [`Invalid input` on a boolean](#invalid-input-on-a-boolean)
- [`Invalid input` on a date](#invalid-input-on-a-date)
- [`Invalid input` on a JSON value](#invalid-input-on-a-json-value)
- [`Invalid input` on a list of one](#invalid-input-on-a-list-of-one)

**Wrong values, no error**

- [`?draft=false` reads `true`](#draftfalse-reads-true)
- [The client accepts anything for a key](#the-client-accepts-anything-for-a-key)

**Types**

- [`Type 'string' is not assignable to type 'string[]'`](#type-string-is-not-assignable-to-type-string)
- [`Type 'number' is not assignable to type 'string | Date | undefined'`](#type-number-is-not-assignable-to-type-string--date--undefined)
- [`Type '"yes"' is not assignable to type 'boolean | "1" | "true" | "0" | "false" | undefined'`](#type-yes-is-not-assignable-to-type-boolean--1--true--0--false--undefined)
- [`Expected 1 arguments, but got 0.`](#expected-1-arguments-but-got-0)

**The OpenAPI document**

- [A route documents no query parameter](#a-route-documents-no-query-parameter)
- [A response is documented as `{}`](#a-response-is-documented-as-)

## A `400` from validation

### `Expected a number`

**When:** a key read by `zq.number()` or `zq.int()` is given text that is
not a number: `/items/abc`, `?page=`, `?limit=0x10`, `?n=Infinity`.

**Why:** the coercion accepts a number, or the text of one — digits, with
an optional sign, decimal point and exponent — and nothing else. An empty
value is refused rather than read as `0`.

**Fix:** send a number; a typed client already refuses anything else. When
the key is optional, leave it out rather than sending it empty:

```ts
await api.get('/items', { query: { page: input.value === '' ? undefined : Number(input.value) } });
```

If the key is not a number at all — a slug, an id with letters — it is a
`z.string()`, not a coercion.

### `Invalid input: expected int, received number`

**When:** `zq.int()` is given a number with a fraction: `?page=1.5`.

**Why:** `zq.int()` reads the number, then refuses anything but an integer.

**Fix:** send an integer, or accept fractions with `zq.number()`:

```ts
const query = z.object({ page: zq.int(), price: zq.number() });
```

### `Invalid input: expected number, received string`

**When:** a key in `params`, `query`, `headers` or `cookies` is a plain
`z.number()` — or a `z.array(z.number())`, or `zq.json(z.array(z.number()))`
that the client sends as an array.

**Why:** everything in a URL, a header or a cookie is text, and
`z.number()` refuses text. The typed client is happy, since its input is a
`number`, so the error only shows at run time. For `zq.json`, the client
sends an array the way it sends every array, one value per key
(`?ids=1&ids=2`), so the schema receives the strings `'1'` and `'2'`, not
JSON.

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

### `Invalid input` on a boolean

**When:** `zq.boolean()` is given anything but `true`, `false`, `'true'`,
`'false'`, `'1'` or `'0'`: `?draft=yes`, `?draft=TRUE`, `?draft=on`, or
`?draft=` with no value. An HTML checkbox sends `on`.

**Why:** the four texts are the only ones read; anything else is refused,
not guessed.

**Fix:** send one of the four — a typed client sends `true` or `false` as
`'true'` or `'false'`. For a checkbox in a form, read its presence instead:

```ts
const form = z.object({ draft: z.literal('on').optional().transform((value) => value === 'on') });
```

### `Invalid input` on a date

**When:** `zq.date()` is given text that is not ISO 8601 with an offset or
a date alone: `?since=2026-01-01T10:00` (what an HTML `datetime-local`
input gives), `?since=1767225600000`, `?since=tomorrow`.

**Why:** a date and time without `Z` or an offset names no instant — it
depends on a time zone the server does not know — so it is refused rather
than read in the server's zone. A timestamp and loose text are refused too.

**Fix:** send a `Date`; the client sends it as its `toISOString()`. A
`datetime-local` value becomes one in the browser, in the user's zone:

```ts
await api.get('/orders', { query: { since: new Date(input.value) } });
```

A date alone, `?since=2026-01-01`, is accepted, and reads midnight UTC.

### `Invalid input` on a JSON value

**When:** a key read by `zq.json(schema)` is given text that is not JSON:
`?filter={`, `?filter=min:3`. Or `schema` is a `z.string()`, and the client
sends a plain string.

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

### `Invalid input` on a list of one

**When:** `zq.array(item)` is given its key once, and `item` refuses that
value: `?ids=x` for `zq.array(zq.int())`.

**Why:** the key given once is tried as one item, then as a list, and both
fail, so the issue is Zod's `Invalid input` on the key. Given more than
once, `?ids=1&ids=x`, the item's own issue is reported at its index:
`path: ["ids", 1]`, `Expected a number`.

**Fix:** send values the item accepts. To see the item's message in a test,
give the key twice:

```ts
const response = await app.request('/orders?ids=1&ids=x');
(await response.json()).issues[0].message; // 'Expected a number'
```

## Wrong values, no error

### `?draft=false` reads `true`

**When:** a flag is a `z.coerce.boolean()`.

**Why:** `z.coerce.boolean()` is `Boolean(value)`, and every non-empty
string is truthy, `'false'` and `'0'` included.

**Fix:**

```ts
const query = z.object({ draft: zq.boolean().default(false) }); // 'false' and '0' read false
```

### The client accepts anything for a key

**When:** a key is a `z.coerce.number()`, `z.coerce.boolean()` or
`z.coerce.date()`. The typed client accepts `{ page: 'two' }` or
`{ page: {} }` without a complaint, and the server refuses it at run time.

**Why:** a `z.coerce` schema's input is `unknown`, and the client is typed
with the schema's input.

**Fix:** use the `zq` coercion, whose input is the value or its text:

```ts
const params = z.object({ page: zq.int() }); // the client sends number | string
```

## Types

### `Type 'string' is not assignable to type 'string[]'`

```text
error TS2322: Type 'string' is not assignable to type 'string[]'.
```

**When:** the client sends one value for a key that is a `z.array(...)`:
`query: { tag: 'a' }`.

**Why:** `z.array`'s input is an array. Sending `['a']` compiles, and the
URL is then `?tag=a`, which `z.array` refuses at run time — see
[`expected array, received string`](#invalid-input-expected-array-received-string).

**Fix:** make it a `zq.array`, whose input is one value or several:

```ts
const query = z.object({ tag: zq.array(z.string()).optional() });

await api.get('/posts', { query: { tag: 'a' } });
```

### `Type 'number' is not assignable to type 'string | Date | undefined'`

```text
error TS2322: Type 'number' is not assignable to type 'string | Date | undefined'.
```

**When:** the client sends a timestamp for a `zq.date()`:
`query: { since: Date.now() }`.

**Why:** `zq.date()` reads a `Date` or ISO 8601 text, not a number.

**Fix:**

```ts
await api.get('/orders', { query: { since: new Date(Date.now() - 86_400_000) } });
```

### `Type '"yes"' is not assignable to type 'boolean | "1" | "true" | "0" | "false" | undefined'`

```text
error TS2322: Type '"yes"' is not assignable to type 'boolean | "1" | "true" | "0" | "false" | undefined'.
```

**When:** the client sends text other than the four a `zq.boolean()`
reads.

**Why:** the server would refuse it with
[`Invalid input`](#invalid-input-on-a-boolean); the type says so first.

**Fix:** send a boolean:

```ts
await api.get('/orders', { query: { exact: input.value === 'yes' } });
```

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
