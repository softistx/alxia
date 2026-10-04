# Guide

This page covers the two things `@alxia/zod` adds to an alxia app: the `zq`
coercions, which read the text a request carries as the values a client
means to send, and `zodConverter`, which gives a Zod schema as JSON Schema
2020-12 as it really crosses the wire.

```ts
import { alxia, validate } from '@alxia/core';
import { zq } from '@alxia/zod';
import { z } from 'zod';

const app = alxia().get(
	'/items/:id',
	validate({ params: z.object({ id: zq.int() }) }),
	({ params, reply }) => reply(200, { id: params.id, next: params.id + 1 }),
);

const result = await app.request('/items/41');
await result.json(); // { id: 41, next: 42 }
```

The path arrives as the text `'41'`; the handler reads the number `41`, and
the schema's input, `number | string`, says a client may send the number
itself, not a string it would have to format.

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
//                        (an array schema: string only)

declare const zq: {
	number(): z.ZodType<number, number | string>;
	int(): z.ZodType<number, number | string>;
	boolean(): z.ZodType<boolean, boolean | 'true' | 'false' | '1' | '0'>;
	date(): z.ZodType<Date, Date | string>;
	array<Item extends z.ZodType>(item: Item): z.ZodType<z.output<Item>[], z.input<Item> | z.input<Item>[]>;
	json<Schema extends z.ZodType>(schema: Schema): z.ZodType<z.output<Schema>, string | Exclude<z.input<Schema>, readonly unknown[]>>;
};

// Any Zod schema as it is, zodConverter(Order, 'output'), or any Standard
// Schema: one whose vendor is not 'zod' gives undefined.
declare function zodConverter(
	schema: {
		readonly '~standard': {
			readonly vendor: string;
			readonly jsonSchema?: {
				readonly input: (options: { readonly target: string }) => Record<string, unknown>;
				readonly output: (options: { readonly target: string }) => Record<string, unknown>;
			};
		};
	},
	side: 'input' | 'output',
): Record<string, unknown> | undefined;
```

The published types are the exact Zod pipes and unions these stand for, so
`.optional()`, `.default()`, `.describe()` and the rest of Zod's methods are
there as on any schema.

## Coercions: `zq`

Path parameters, the query string, headers and cookies are text. Zod's own
`z.coerce.number()` reads that text, but its input is `unknown`, so a typed
client accepts anything for the key. `z.number()` has the right input,
but refuses the text the server receives. A `zq` coercion does both: its
input is the value, the server accepts the value or its text.

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
	validate({
		query: z.object({ year: zq.int(), draft: zq.boolean().optional() }),
		headers: z.object({ 'x-page-size': zq.int().default(20) }),
		cookies: z.object({ beta: zq.boolean().default(false) }),
	}),
	({ query, headers, cookies, reply }) =>
		reply(200, { year: query.year, size: headers['x-page-size'], beta: cookies.beta }),
);
```

A client sends a value as text the coercion reads back: a number or a boolean with `String`, a `Date` with `toISOString()`, an
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

`zq.number()`, then an integer. `'2'` reads `2`; text that is not a number
is refused with `Expected a number`, and `'1.5'` and `2.5` with
`Expected an integer`. It is the
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

Anything else is refused with `Expected true, false, 1 or 0`: `'yes'`, `'TRUE'`,
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

Refused, with `Expected an ISO 8601 date or date-time`:

- a date and time with no offset, `'2026-01-01T10:00'` — which is what an
  HTML `datetime-local` input gives; it names no instant, so it is not
  guessed at (see [Troubleshooting](troubleshooting.md#expected-an-iso-8601-date-or-date-time));
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

A refused list reports the first issue of what was refused: the one value
given, or the list. Given once (`?ids=x`), the issue is on the key: path
`["ids"]`, `Expected a number`. Given more than once (`?ids=1&ids=x`), each
refused item is its own issue at its index, path `["ids", 1]`, when the
item is a plain schema such as `zq.int()`, `zq.number()` or `z.string()`. For an item that
is itself a union or an object — `z.enum(…)`, `zq.date()`, `zq.boolean()`,
`z.object(…)` — the issue is `invalid_union` on the key, with the item's
message: its index, or its inner path, is not kept.

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

A client typed by the schema's input sends an object as its JSON text,
`?range={"min":1,"max":5}`. Text that is not JSON
is refused with `Expected JSON`; JSON that does not match the schema is
refused with the schema's own issue, at the path inside it:

```text
?range={"min":"x","max":5}   →  path ["range", "min"]: Invalid input: expected number, received string
```

An array is the exception: its input is its JSON
text, a `string`, not as the array. A query sends a list as one value per
key, `?ids=1&ids=2`, which is not JSON, so an array given as itself could
never reach the schema:

```ts
const app = alxia().get(
	'/ids',
	validate({ query: z.object({ ids: zq.json(z.array(z.number())) }) }),
	({ query, reply }) => reply(200, query.ids), // number[]
);

await app.request(`/ids?${new URLSearchParams({ ids: JSON.stringify([1, 2]) })}`); // ?ids=[1,2]
```

For a list a key repeats, use [`zq.array(item)`](#zqarrayitem) instead.
A plain string does not suit `zq.json` either: see
[Troubleshooting](troubleshooting.md#expected-json).

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
| `number`, `int` | neither a number nor text, such as an object | `invalid_union` | `Expected a number` |
| `int` | a number that is not an integer | `invalid_type` | `Expected an integer` |
| `boolean` | text other than the four | `invalid_union` | `Expected true, false, 1 or 0` |
| `date` | text that is not ISO 8601 with an offset, or a date | `invalid_union` | `Expected an ISO 8601 date or date-time` |
| `json` | text that is not JSON | `invalid_union` | `Expected JSON` |
| `json` | JSON the schema refuses | the schema's | the schema's, at its path |
| `array` | a key given once, which the item schema refuses | `invalid_union` | the item's, on the key: `Expected a number` for `zq.int()` |
| `array` | a key given more than once, one of them refused | the item's, or `invalid_union` | the item's: at its index (`["ids", 1]`) for `zq.int()` or `z.string()`; on the key, without the index, for an enum, `zq.date()`, `zq.boolean()` or an object |

A client typed by the schema's input refuses most of these at compile
time; the `400` is what a hand-written URL, a link, or another client gets.

## JSON Schema: `zodConverter`

> **Deprecated.** Nothing in alxia reads it any more: it served the
> `convert` option of the retired `@alxia/openapi` document writer. It stays
> exported, unchanged, for code that already calls it.

alxia is OpenAPI spec first: the document is written by hand, and the
routes' schemas come from it or are checked against it, so nothing in
alxia converts a Zod schema for you. `zodConverter` is for your own use —
writing the schemas of Zod you already have into a hand-written document,
or handing them to any JSON Schema consumer. Zod's own conversion throws on
what JSON Schema cannot say, a `z.date()`, a `z.bigint()`, a `.transform()`;
`zodConverter` converts a Zod schema as it crosses the wire instead:

```ts
import { zodConverter } from '@alxia/zod';
import { z } from 'zod';

const Event = z.object({ id: z.string(), at: z.date() });

zodConverter(Event, 'output');
// {
//   $schema: 'https://json-schema.org/draft/2020-12/schema',
//   type: 'object',
//   properties: { id: { type: 'string' }, at: { type: 'string', format: 'date-time' } },
//   required: ['id', 'at'],
//   additionalProperties: false,
// }
```

| In the schema | Zod's own conversion | `zodConverter` |
| --- | --- | --- |
| `z.date()` | throws `Date cannot be represented in JSON Schema` | `{ "type": "string", "format": "date-time" }` |
| `z.bigint()` | throws | `{ "type": "integer" }` |
| anything else JSON Schema cannot say: a `.transform()`'s output, a `z.map()` | throws | that one field is `{}`, anything; the rest is converted |
| a schema of another vendor | — | `undefined`, for your own conversion |

A `Date` is a `date-time` string because that is what a client receives: a
reply is sent as JSON, where a `Date` is its ISO text.

`side` picks the side of the schema. A request schema — `params`, `query`,
`headers`, `cookies`, `body` — is converted by its `'input'`, what a client
may send; a response by its `'output'`, what it gets. So `zq.int()` in a
query converts as a number or numeric text:

```ts
zodConverter(z.object({ page: zq.int().optional() }), 'input');
// properties.page:
// {
//   anyOf: [
//     { type: 'number' },
//     { type: 'string', pattern: '^\\s*[-+]?(\\d+\\.?\\d*|\\.\\d+)(e[-+]?\\d+)?\\s*$' },
//   ],
// }
```

`zq.json(schema)` converts as a string or anything: the shape inside the
text is not described. Say it with `.describe()`, which the JSON Schema
carries as its `description`:

```ts
const query = z.object({
	total: zq
		.json(z.object({ min: z.number(), max: z.number() }))
		.optional()
		.describe('A JSON range, as {"min":10,"max":50}'),
});
```

`zodConverter` targets JSON Schema 2020-12, the dialect of OpenAPI 3.1 and
3.2, so what it returns fits under a document's `components.schemas` as it
is, `$schema` included. A script that writes them once, for you to edit by
hand from then on:

```ts
// scripts/schemas.ts — bun scripts/schemas.ts
import { zodConverter } from '@alxia/zod';
import { NewOrder, Order } from '../src/schemas';

const components = {
	schemas: {
		Order: zodConverter(Order, 'output'),
		NewOrder: zodConverter(NewOrder, 'input'),
	},
};
await Bun.write('openapi/components.yaml', Bun.YAML.stringify(components, null, 2));
```

The routes are then generated from the document and checked against it:
see [`@alxia/openapi`](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/guide/spec-first.md).

## A realistic setup

A list of orders a page filters by status, date and total, and its tests
through `app.request()`:

```ts
// app.ts
import { alxia, responds, validate } from '@alxia/core';
import { zq } from '@alxia/zod';
import { z } from 'zod';

export const Order = z.object({
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
	validate({
		query: z.object({
			page: zq.int().default(1),
			status: zq.array(Order.shape.status).optional(),
			since: zq.date().optional(),
			total: zq.json(z.object({ min: z.number(), max: z.number() })).optional(),
		}),
	}),
	responds({ 200: z.object({ page: z.number(), items: z.array(Order) }) }),
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
```

```ts
// app.spec.ts
import { describe, expect, test } from 'bun:test';
import { zodConverter } from '@alxia/zod';
import { app, Order } from './app';

describe('GET /orders', () => {
	test('values sent as text, read typed by the route', async () => {
		const query = new URLSearchParams([
			['status', 'paid'],
			['status', 'open'],
			['since', new Date('2026-03-01T00:00:00Z').toISOString()],
			['total', JSON.stringify({ min: 10, max: 50 })],
		]);
		const result = await app.request(`/orders?${query}`);
		expect(result.status).toBe(200);
		expect(await result.json()).toMatchObject({ page: 1, items: [{ id: 'a1' }, { id: 'a2' }] });
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

	test('an order as JSON Schema says what crosses the wire', () => {
		expect(zodConverter(Order, 'output')).toMatchObject({
			properties: { createdAt: { type: 'string', format: 'date-time' } },
		});
	});
});
```

Zod's own `z.toJSONSchema(Order)` throws on `createdAt` instead.

When a request is still refused, [Troubleshooting](troubleshooting.md)
starts from the issue message in the `400`.
