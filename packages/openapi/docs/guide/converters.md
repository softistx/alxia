# Schemas and converters

This page covers how a route's schemas become JSON Schema: the default
conversion, the `convert` option that runs before it, and `toJsonSchema`,
which does the same for one schema.

```ts
import { toJsonSchema } from '@alxia/openapi';
import { z } from 'zod';

toJsonSchema(z.object({ id: z.number() }), 'output');
// { type: 'object', properties: { id: { type: 'number' } }, required: ['id'], additionalProperties: false }
```

`@alxia/openapi` imports no validator. A route's schemas are
[Standard Schemas](https://standardschema.dev); the package asks each one
for its JSON Schema, and only a `convert` you pass knows any library by
name.

## The order of conversion

For each schema, `toJsonSchema` — and so `openapi` and `docs` — tries, in
order:

1. an **event stream** (`eventStream(schema)` from `@alxia/core`) is
   replaced by the schema of one event, and converted as below;
2. **`convert`**, when given: what it returns is used, unless it returns
   `undefined`;
3. **Standard JSON Schema**, the `~standard.jsonSchema` that Zod 4.2 and
   later, ArkType and Valibot carry, asked for the `draft-2020-12` target;
4. **`{}`**, which means "anything", when the schema carries no JSON
   Schema, or when converting it throws.

A `$schema` key in the result is removed: the document states its dialect
once.

```ts
function toJsonSchema(schema: StandardSchemaV1, side: Side, convert?: Converter): JsonSchema;

type JsonSchema = Record<string, unknown>;
type Side = 'input' | 'output';
```

## Input and output

A schema has two sides, and they differ whenever it coerces, transforms
or defaults:

| `side` | Used for | Means |
| --- | --- | --- |
| `'input'` | `params`, `query`, `headers`, `cookies`, `body` | what the schema accepts: what the client sends |
| `'output'` | each `response` | what the schema gives back: what the client receives |

```ts
const Count = z.string().transform(Number);

toJsonSchema(Count, 'input');  // { type: 'string' }
toJsonSchema(Count, 'output'); // {} — Zod cannot describe a transform's result
```

## Zod and `Date`: `zodConverter`

Zod's own conversion refuses what JSON Schema cannot say — a `Date`, a
`bigint` — by throwing, and a schema whose conversion throws is
documented as `{}`, **whole**: one `Date` field empties the reply it is
in. `@alxia/zod` exports a converter that documents them as they cross
the wire:

```sh
bun add @alxia/zod
```

```ts
import { alxia } from '@alxia/core';
import { openapi } from '@alxia/openapi';
import { zodConverter } from '@alxia/zod';
import { z } from 'zod';

const app = alxia().get(
	'/events/:id',
	{ response: { 200: z.object({ at: z.date(), size: z.bigint() }) } },
	({ reply }) => reply(200, { at: new Date(), size: 1n }),
);

openapi(app, { info: { title: 'Events', version: '1.0.0' }, convert: zodConverter });
// 200 → { type: 'object', properties: { at: { type: 'string', format: 'date-time' }, size: { type: 'integer' } }, ... }
```

Without it, the same reply is documented as `{}`. `zodConverter` returns
`undefined` for a schema of any other vendor, so the default conversion
still runs for those, and a document can mix validators.

## Writing a `Converter`

```ts
type Converter = (schema: StandardSchemaV1, side: Side) => JsonSchema | undefined;
```

Return the JSON Schema for the schemas you handle, `undefined` for the
rest. `schema['~standard'].vendor` names the library.

A validator that carries no Standard JSON Schema — or a schema written by
hand — is documented as `{}` until a converter knows it:

```ts
import type { StandardSchemaV1 } from '@alxia/core';
import { type Converter, openapi } from '@alxia/openapi';

// a hand-written schema, with the JSON Schema it stands for
const Slug = {
	'~standard': {
		version: 1,
		vendor: 'app',
		validate: (value: unknown) =>
			typeof value === 'string' && /^[a-z0-9-]+$/.test(value)
				? { value }
				: { issues: [{ message: 'not a slug' }] },
	},
} satisfies StandardSchemaV1<string>;

const known = new Map<StandardSchemaV1, Record<string, unknown>>([
	[Slug, { type: 'string', pattern: '^[a-z0-9-]+$' }],
]);

const convert: Converter = (schema) => known.get(schema);

openapi(app, { info: { title: 'Pages', version: '1.0.0' }, convert });
```

A converter also lets you say more than the library does. Chain one
before another by trying each in turn:

```ts
import { type Converter } from '@alxia/openapi';
import { zodConverter } from '@alxia/zod';

const convert: Converter = (schema, side) => known.get(schema) ?? zodConverter(schema, side);
```

What a converter returns is used as it is, for both sides: it is not
checked, and a `$schema` key is the only thing removed.

## Related

- [How a route is documented](routes.md) — which side each part of a
  route uses, and where the result goes.
- [Troubleshooting](../troubleshooting.md#every-schema-in-the-document-is-) —
  when the document is full of `{}`.
