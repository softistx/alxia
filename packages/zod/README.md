# @alxia/zod

[Zod 4](https://zod.dev) for [alxia](https://www.npmjs.com/package/@alxia/core).
`@alxia/core` validates with any Standard Schema and imports no validator;
this package adds what only Zod can: coercions of the text a request
carries, typed by what a client means to send, and the
OpenAPI conversion of what Zod alone knows how to say.

```sh
bun add @alxia/zod zod
bun add -d typescript
```

`zod` is a peer: your app's own copy is the one used.

## Coercions: `zq`

Path parameters, the query string, headers and cookies arrive as text.
`z.coerce.number()` reads them, but its input is `unknown`. `zq` reads the
same text, and its input is the value a client means to send, so the
OpenAPI document, and a client generated from it, say so:

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

## OpenAPI: `zodConverter`

```ts
import { openapi, docs } from '@alxia/openapi';
import { zodConverter } from '@alxia/zod';

openapi(app, { info, convert: zodConverter });
app.use(docs(app, { info, convert: zodConverter }));
```

Without it, a schema JSON Schema cannot express — a `z.date()` — is
documented as anything. With it, a `Date` is documented as the `date-time`
string the client receives, a `bigint` as an integer, and only what truly
has no JSON Schema as anything. A schema of another vendor is left to the
default conversion.

## API

| export | |
| --- | --- |
| `zq` | `number`, `int`, `boolean`, `date`, `array`, `json` |
| `zodConverter(schema, side)` | a `Converter` for `@alxia/openapi` |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/zod/docs): what each coercion accepts, refuses and lets a client send, and what the OpenAPI converter changes in a document.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/zod/docs/troubleshooting.md): a validation message or a `tsc` error, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/zod/docs/roadmap.md): what is coming, and what is not planned.
