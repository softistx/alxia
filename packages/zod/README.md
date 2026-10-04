# @alxia/zod

[Zod 4](https://zod.dev) for [alxia](https://www.npmjs.com/package/@alxia/core).
`@alxia/core` validates with any Standard Schema and imports no validator;
this package adds what only Zod can: coercions of the text a request
carries, typed by what a client means to send, and a Zod schema as JSON
Schema, as it crosses the wire.

```sh
bun add @alxia/zod zod
bun add -d typescript
```

`zod` is a peer: your app's own copy is the one used.

## Coercions: `zq`

Path parameters, the query string, headers and cookies arrive as text.
`z.coerce.number()` reads them, but its input is `unknown`. `zq` reads the
same text, and its input is the value a client means to send:

```ts
import { validate } from '@alxia/core';
import { zq } from '@alxia/zod';
import { z } from 'zod';

app.get('/search/:page', validate({
	params: z.object({ page: zq.int() }),
	query: z.object({
		tags: zq.array(z.string()).optional(),  // ?tags=a and ?tags=a&tags=b
		exact: zq.boolean().optional(),         // true/false/1/0
		since: zq.date().optional(),            // ISO 8601
		filter: zq.json(Filter).optional(),     // ?filter={"min":3}
	}),
}), ...);

await app.request(`/search/2?exact=true&since=${new Date().toISOString()}`);
```

| | the server reads | the client sends |
| --- | --- | --- |
| `zq.number()` | `number` | `number \| string` |
| `zq.int()` | an integer | `number \| string` |
| `zq.boolean()` | `boolean` | `boolean \| 'true' \| 'false' \| '1' \| '0'` |
| `zq.date()` | `Date` | `Date \| string` |
| `zq.array(item)` | `Item[]`, from one value or many | `Item \| Item[]` |
| `zq.json(schema)` | the schema's output | the schema's input, sent as JSON; an array as its JSON text, `JSON.stringify(ids)` |

## JSON Schema: `zodConverter`

> **Deprecated.** Nothing in alxia reads `zodConverter` any more: it served
> the `convert` option of the retired `@alxia/openapi` document writer. It
> stays exported, unchanged. Zod's own `z.toJSONSchema` does the same, but
> throws where `zodConverter` documents a value as anything.

A Zod schema as JSON Schema 2020-12, for your own use: writing it into a
hand-written OpenAPI document, or handing it to any JSON Schema consumer.

```ts
import { zodConverter } from '@alxia/zod';
import { z } from 'zod';

const Todo = z.object({ id: z.number(), title: z.string(), due: z.date() });

zodConverter(Todo, 'output'); // a reply: what the client receives
// { type: 'object', properties: { …, due: { type: 'string', format: 'date-time' } }, … }
```

Where Zod's own conversion throws on what JSON Schema cannot express — a
`z.date()` — a `Date` is the `date-time` string the client receives, a
`bigint` an integer, and only what truly has no JSON Schema is `{}`,
anything. `'input'` converts what a client sends, for a request part. A
schema of another vendor gives `undefined`.

## API

| export | |
| --- | --- |
| `zq` | `number`, `int`, `boolean`, `date`, `array`, `json` |
| `zodConverter(schema, side)` | deprecated: a Zod schema as JSON Schema 2020-12, its `'input'` or its `'output'`; `undefined` for another vendor |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/zod/docs): what each coercion accepts, refuses and lets a client send, and what `zodConverter` gives where Zod's own conversion throws.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/zod/docs/troubleshooting.md): a validation message or a `tsc` error, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/zod/docs/roadmap.md): what is coming, and what is not planned.
