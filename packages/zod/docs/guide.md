# Guide

This page covers the two things `@alxia/zod` adds to an alxia app: the `zq`
coercions, which read the text a request carries as the values a client
means to send, and `zodConverter`, which documents a Zod schema in OpenAPI
as it really crosses the wire.

```ts
import { client } from '@alxia/client';
import { alxia } from '@alxia/core';
import { zq } from '@alxia/zod';
import { z } from 'zod';

const app = alxia().get(
	'/items/:id',
	{ params: z.object({ id: zq.int() }) },
	({ params, reply }) => reply(200, { id: params.id, next: params.id + 1 }),
);

const result = await client(app).get('/items/:id', { params: { id: 41 } });
result.data; // { id: 41, next: 42 }
```

The path arrives as the text `'41'`; the handler reads the number `41`, and
the client is typed to send a number, not a string it would have to format.

## The signature

```ts
import type { z } from 'zod';

// Each coercion is a Zod schema. Its input is what the client may send,
// its output what the handler reads:
//
//                        z.input (the client sends)        z.output (the server reads)
// zq.number()            number | string                   number
// zq.int()               number | string                   number, an integer
// zq.boolean()           boolean | 'true' | 'false' | '1' | '0'   boolean
// zq.date()              Date | string                     Date
// zq.array(item)         z.input<item> | z.input<item>[]   z.output<item>[]
// zq.json(schema)        string | z.input<schema>          z.output<schema>

declare const zq: {
	number(): z.ZodType<number, number | string>;
	int(): z.ZodType<number, number | string>;
	boolean(): z.ZodType<boolean, boolean | 'true' | 'false' | '1' | '0'>;
	date(): z.ZodType<Date, Date | string>;
	array<Item extends z.ZodType>(item: Item): z.ZodType<z.output<Item>[], z.input<Item> | z.input<Item>[]>;
	json<Schema extends z.ZodType>(schema: Schema): z.ZodType<z.output<Schema>, string | z.input<Schema>>;
};

declare function zodConverter(
	schema: { readonly '~standard': { readonly vendor: string } },
	side: 'input' | 'output',
): Record<string, unknown> | undefined;
```

The published types are the exact Zod pipes and unions these stand for, so
`.optional()`, `.default()`, `.describe()` and the rest of Zod's methods are
there as on any schema.

## Coercions: `zq`

Path parameters, the query string, headers and cookies are text. Zod's own
`z.coerce.number()` reads that text, but its input is `unknown`, so a typed
client accepts anything for the key. `z.number()` types the client right,
but refuses the text the server receives. A `zq` coercion does both: the
client is typed with the value, the server accepts the value or its text.

| | `z.number()` | `z.coerce.number()` | `zq.number()` |
| --- | --- | --- | --- |
| the client may send | `number` | anything | `number \| string` |
| `?n=2` on the server | refused: `expected number, received string` | `2` | `2` |
| `?n=abc` on the server | refused | refused | refused: `Expected a number` |

Use them wherever a value arrives as text: `params`, `query`, `headers`,
`cookies`, and the fields of a form body. A JSON body already carries
numbers, booleans and arrays, so `z.number()` is right there.

```ts
app.get(
	'/reports',
	{
		query: z.object({ year: zq.int(), draft: zq.boolean().optional() }),
		headers: z.object({ 'x-page-size': zq.int().default(20) }),
		cookies: z.object({ beta: zq.boolean().default(false) }),
	},
	({ query, headers, cookies, reply }) =>
		reply(200, { year: query.year, size: headers['x-page-size'], beta: cookies.beta }),
);
```

When the client sends a value, it turns it into text the coercion reads
back: a number or a boolean with `String`, a `Date` with `toISOString()`, an
object as JSON, and each item of an array under the same key.

### `zq.number()`

A number, or the text of one: an optional sign, digits with an optional
decimal point, an optional exponent, and surrounding spaces.

```ts
zq.number().parse('3');     // 3
zq.number().parse(' -2.5 '); // -2.5
zq.number().parse('.5');    // 0.5
zq.number().parse('1e3');   // 1000
zq.number().parse(7);       // 7
```

Anything else is refused with the message `Expected a number`: the empty
string, `'abc'`, `'0x10'`, `'Infinity'`, `'NaN'`. Unlike `Number('')`, an
empty value is never read as `0`.

Chain a check with `.pipe`, since the coercion's output is a plain
`z.number()`:

```ts
const price = zq.number().pipe(z.number().positive());
```

### `zq.int()`

`zq.number()`, then an integer. `'2'` reads `2`; `'1.5'` and `2.5` are
refused with `Invalid input: expected int, received number`. It is the
usual choice for an id in the path, a page, a limit:

```ts
const Page = z.object({
	page: zq.int().pipe(z.number().min(1)).default(1),
	limit: zq.int().pipe(z.number().max(100)).default(20),
});
```

### `zq.boolean()`

`true` or `false`, or one of the texts `'true'`, `'false'`, `'1'`, `'0'`:

```ts
zq.boolean().parse('true'); // true
zq.boolean().parse('0');    // false
zq.boolean().parse(false);  // false
```

Anything else is refused, with Zod's `Invalid input`: `'yes'`, `'TRUE'`,
`'on'`, and the empty string, so `?draft=` is an error rather than a silent
`false`. Compare `z.coerce.boolean()`, which reads `'false'` as `true`,
since any non-empty string is truthy.

A flag that may be absent is `.optional()`, or `.default(false)` to read a
`boolean` either way.

### `zq.date()`

A `Date`, or ISO 8601 text: a date and time with `Z` or an offset, or a
date alone.

```ts
zq.date().parse('2026-01-01T00:00:00Z');      // 2026-01-01T00:00:00.000Z
zq.date().parse('2026-01-01T00:00:00+02:00'); // 2025-12-31T22:00:00.000Z
zq.date().parse('2026-01-01');                // 2026-01-01T00:00:00.000Z, midnight UTC
zq.date().parse(new Date(0));                 // the same Date
```

Refused, with `Invalid input`:

- a date and time with no offset, `'2026-01-01T10:00'` — which is what an
  HTML `datetime-local` input gives; it names no instant, so it is not
  guessed at (see [Troubleshooting](troubleshooting.md#invalid-input-on-a-date));
- a timestamp, `'1767225600000'`;
- anything `Date` would parse loosely, `'tomorrow'`, `'Jan 1 2026'`;
- an invalid `Date` object.

A client sends a `Date` as its `toISOString()`, which always reads back.

### `zq.array(item)`

A list a key gives once or more. The server reads the query string with a
key given once as a string and a key given more than once as an array of
them; `z.array` refuses the first, so a list of one fails. `zq.array` takes
both:

```ts
const Tags = zq.array(z.string());

Tags.parse('a');        // ['a']           ?tag=a
Tags.parse(['a', 'b']); // ['a', 'b']      ?tag=a&tag=b
```

The item is any schema, a coercion included:

```ts
const Ids = zq.array(zq.int());
Ids.parse('1');          // [1]
Ids.parse(['1', '2']);   // [1, 2]

const Statuses = zq.array(z.enum(['open', 'paid', 'shipped']));
```

A refused item is reported at its index when the key was given more than
once (`?ids=1&ids=x` → path `["ids", 1]`, `Expected a number`), and as
`Invalid input` on the key when it was given once (`?ids=x`), since neither
"one item" nor "a list" matched.

An absent key is `undefined`, not `[]`: make the list `.optional()`, or
`.default([])`.

### `zq.json(schema)`

A value given as JSON text, then validated by `schema`: a filter, a range,
a sort in the query string.

```ts
const Range = zq.json(z.object({ min: z.number(), max: z.number() }));

Range.parse('{"min":1,"max":5}'); // { min: 1, max: 5 }
Range.parse({ min: 1, max: 5 });   // { min: 1, max: 5 }, already parsed
```

The client is typed with the schema's input and sends an object as its JSON,
so it writes `query: { range: { min: 1, max: 5 } }`. Text that is not JSON
is refused with `Invalid input`; JSON that does not match the schema is
refused with the schema's own issue, at the path inside it:

```text
?range={"min":"x","max":5}   →  path ["range", "min"]: Invalid input: expected number, received string
```

Two shapes do not suit it — a string, and an array the client sends; both
are in [Troubleshooting](troubleshooting.md#invalid-input-on-a-json-value).

## What a refusal looks like

A value a coercion refuses fails the route's validation like any other: the
handler does not run, and the route answers its `400`, with one issue per
problem. From `GET /items/x`:

```json
{
	"error": "validation",
	"issues": [
		{ "target": "params", "path": ["id"], "code": "invalid_format", "message": "Expected a number" }
	]
}
```

| Coercion | Refused value | `code` | `message` |
| --- | --- | --- | --- |
| `number`, `int` | text that is not a number | `invalid_format` | `Expected a number` |
| `int` | a number that is not an integer | `invalid_type` | `Invalid input: expected int, received number` |
| `boolean` | text other than the four | `invalid_union` | `Invalid input` |
| `date` | text that is not ISO 8601 with an offset, or a date | `invalid_union` | `Invalid input` |
| `json` | text that is not JSON | `invalid_union` | `Invalid input` |
| `json` | JSON the schema refuses | the schema's | the schema's, at its path |
| `array` | a key given once, which the item schema refuses | `invalid_union` | `Invalid input` |
| `array` | a key given more than once, one of them refused | the item's | the item's, at its index: path `["ids", 1]` |

A typed client already refuses most of these at compile time; the `400` is
what a hand-written URL, a link, or another client gets.

## OpenAPI: `zodConverter`

`@alxia/openapi` converts a schema through Standard JSON Schema, which Zod
4.2 and later carries. That conversion fails on what JSON Schema cannot
say — a `z.date()`, a `z.bigint()`, a `.transform()` — and when it fails,
the whole schema is documented as `{}`, anything. `zodConverter` converts a
Zod schema as it crosses the wire instead:

```ts
import { alxia } from '@alxia/core';
import { docs, openapi } from '@alxia/openapi';
import { zodConverter } from '@alxia/zod';
import { z } from 'zod';

const app = alxia().get(
	'/events/:id',
	{ response: { 200: z.object({ id: z.string(), at: z.date() }) } },
	({ params, reply }) => reply(200, { id: params.id, at: new Date() }),
);

const info = { title: 'Events', version: '1.0.0' };

const document = openapi(app, { info, convert: zodConverter }); // the document as an object
app.use(docs(app, { info, convert: zodConverter }));             // or served, at /openapi.json and /docs
```

| In the schema | Without `zodConverter` | With it |
| --- | --- | --- |
| `z.date()` | the whole schema is `{}` | `{ "type": "string", "format": "date-time" }` |
| `z.bigint()` | the whole schema is `{}` | `{ "type": "integer" }` |
| anything else JSON Schema cannot say: a `.transform()`'s output, a `z.map()` | the whole schema is `{}` | that one field is `{}`; the rest is documented |
| a `params`, `query`, `headers` or `cookies` schema holding one of these | **no parameter** is documented for it | each parameter is documented |
| a schema of another vendor | the default conversion | the default conversion: `zodConverter` returns `undefined` for it |

A `Date` is documented as a `date-time` string because that is what a
client receives: a reply is sent as JSON, where a `Date` is its ISO text,
and `@alxia/client` types it as a `string`.

Each schema is documented from the side it is on. A request schema —
`params`, `query`, `headers`, `cookies`, `body` — is documented by its
input, what a client may send; a response by its output, what it gets. So
`zq.int()` in a query documents as a number or numeric text:

```json
{
	"name": "page",
	"in": "query",
	"required": false,
	"schema": {
		"anyOf": [
			{ "type": "number" },
			{ "type": "string", "pattern": "^\\s*[-+]?(\\d+\\.?\\d*|\\.\\d+)(e[-+]?\\d+)?\\s*$" }
		]
	}
}
```

`zq.json(schema)` documents as a string or anything: the shape inside the
text is not described. Say it with `.describe()`, which the document
carries as the parameter's description:

```ts
const query = z.object({
	total: zq
		.json(z.object({ min: z.number(), max: z.number() }))
		.optional()
		.describe('A JSON range, as {"min":10,"max":50}'),
});
```

`zodConverter` targets JSON Schema 2020-12, the dialect of OpenAPI 3.1, and
fits the `convert` option as it is: its type matches `@alxia/openapi`'s
`Converter` without importing it, so this package has no dependency on
`@alxia/openapi`.

## A realistic setup

A list of orders a page filters by status, date and total, documented, and
its tests through the typed client:

```ts
// app.ts
import { alxia } from '@alxia/core';
import { docs } from '@alxia/openapi';
import { zodConverter, zq } from '@alxia/zod';
import { z } from 'zod';

const Order = z.object({
	id: z.string(),
	status: z.enum(['open', 'paid', 'shipped']),
	total: z.number(),
	createdAt: z.date(),
});

const orders: z.output<typeof Order>[] = [
	{ id: 'a1', status: 'paid', total: 40, createdAt: new Date('2026-03-01T09:00:00Z') },
	{ id: 'a2', status: 'open', total: 12, createdAt: new Date('2026-03-02T09:00:00Z') },
];

export const app = alxia().get(
	'/orders',
	{
		query: z.object({
			page: zq.int().default(1),
			status: zq.array(Order.shape.status).optional(),
			since: zq.date().optional(),
			total: zq.json(z.object({ min: z.number(), max: z.number() })).optional(),
		}),
		response: { 200: z.object({ page: z.number(), items: z.array(Order) }) },
	},
	({ query, reply }) =>
		reply(200, {
			page: query.page,
			items: orders.filter(
				(order) =>
					(query.status === undefined || query.status.includes(order.status)) &&
					(query.since === undefined || order.createdAt >= query.since) &&
					(query.total === undefined ||
						(order.total >= query.total.min && order.total <= query.total.max)),
			),
		}),
);

app.use(docs(app, { info: { title: 'Orders', version: '1.0.0' }, convert: zodConverter }));

export type App = typeof app;
```

```ts
// app.spec.ts
import { describe, expect, test } from 'bun:test';
import { client } from '@alxia/client';
import { app } from './app';

const api = client(app);

describe('GET /orders', () => {
	test('the client sends values, the route reads them typed', async () => {
		const result = await api.get('/orders', {
			query: {
				status: ['paid', 'open'],
				since: new Date('2026-03-01T00:00:00Z'),
				total: { min: 10, max: 50 },
			},
		});
		expect(result.status).toBe(200);
		expect(result.data).toMatchObject({ page: 1, items: [{ id: 'a1' }, { id: 'a2' }] });
	});

	test('one status is a list of one', async () => {
		const response = await app.request('/orders?status=paid');
		expect(await response.json()).toMatchObject({
			items: [{ id: 'a1', createdAt: '2026-03-01T09:00:00.000Z' }],
		});
	});

	test('a page that is not an integer is a 400', async () => {
		const response = await app.request('/orders?page=1.5');
		expect(response.status).toBe(400);
	});

	test('the document says what crosses the wire', async () => {
		const document = await (await app.request('/openapi.json')).json();
		const operation = document.paths['/orders'].get;
		const item =
			operation.responses['200'].content['application/json'].schema.properties.items.items;
		expect(item.properties.createdAt).toEqual({ type: 'string', format: 'date-time' });
		expect(operation.parameters.map((p: { name: string }) => p.name)).toEqual([
			'page',
			'status',
			'since',
			'total',
		]);
	});
});
```

Without `convert: zodConverter`, the last test fails twice: the response is
documented as `{}`, and the query, which holds a `zq.date()`, documents no
parameter at all.

When a request is still refused, [Troubleshooting](troubleshooting.md)
starts from the issue message in the `400`.
