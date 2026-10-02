# The document

This page covers `openapi`: the options it takes, the document it returns,
and the two places a consumer usually puts it — a file written at build
time, and a test that keeps it honest.

```ts
import { alxia } from '@alxia/core';
import { openapi } from '@alxia/openapi';
import { z } from 'zod';

const app = alxia().get(
	'/users/:id',
	{
		params: z.object({ id: z.coerce.number() }),
		response: { 200: z.object({ id: z.number(), name: z.string() }) },
	},
	({ reply, params }) => reply(200, { id: params.id, name: 'Ada' }),
);

const document = openapi(app, { info: { title: 'Users', version: '1.0.0' } });
document.paths['/users/{id}']?.get?.operationId; // 'getUsersById'
```

`openapi` reads `app.routes` — every HTTP route the app holds, groups and
plugins included, with their full paths — and returns a plain object. It
starts no server and sends no request; call it whenever you need the
document. To serve it over HTTP instead, see
[Serving the document and its page](serving.md).

## `openapi`

```ts
function openapi(
	app: { readonly routes: readonly RouteDefinition[] },
	options: OpenApiOptions,
): OpenApiDocument;
```

Any `alxia()` app fits `app`. The document holds the routes declared when
it is called: a route added afterwards is in the next call, not this one.

### Options

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `info` | `OpenApiInfo` | required | The document's `info`: `title` and `version` are required, `description` is optional. Copied as given. |
| `servers` | `readonly { url: string; description?: string }[]` | none | The document's `servers`. Left out of the document when not given. |
| `convert` | `Converter` | none | Turns a schema into JSON Schema before the default conversion runs. See [Schemas and converters](converters.md). |
| `exclude` | `(route: RouteDefinition) => boolean` | none | A route for which it returns `true` is left out of the document. |

```ts
interface OpenApiOptions {
	readonly info: OpenApiInfo;
	readonly servers?: readonly { readonly url: string; readonly description?: string }[];
	readonly convert?: Converter;
	readonly exclude?: (route: RouteDefinition) => boolean;
}

interface OpenApiInfo {
	readonly title: string;
	readonly version: string;
	readonly description?: string;
}
```

#### `servers`

```ts
openapi(app, {
	info: { title: 'Users', version: '1.0.0' },
	servers: [
		{ url: 'https://api.example.com', description: 'Production' },
		{ url: 'http://localhost:3000', description: 'Local' },
	],
});
```

#### `exclude`

`exclude` receives each `RouteDefinition` — its `method`, its full `path`
and its `schema` — so a route can be left out by where it lives or by what
it declares:

```ts
openapi(app, {
	info: { title: 'Users', version: '1.0.0' },
	exclude: (route) => route.path.startsWith('/internal') || route.method === 'OPTIONS',
});
```

## What it returns

```ts
interface OpenApiDocument {
	readonly openapi: '3.1.0';
	readonly info: OpenApiInfo;
	readonly servers?: readonly { readonly url: string; readonly description?: string }[];
	readonly paths: Record<string, Partial<Record<Lowercase<Method>, Operation>>>;
	readonly components: { readonly schemas: Record<string, JsonSchema> };
}
```

- `openapi` is always `'3.1.0'`, and every schema in it is JSON Schema
  2020-12, the dialect OpenAPI 3.1 uses.
- `paths` is keyed by the path as OpenAPI writes it (`/users/{id}`), then
  by the lowercase method (`get`, `post`…). Each value is an `Operation`;
  what goes into one is on [How a route is documented](routes.md).
- `components.schemas` holds exactly two schemas, `ValidationError` and
  `InternalError`: the bodies of the 400 and 500 every route may answer.
  Your own schemas are written inline in each operation, not as
  components.

Both indexes of `paths` may be missing, so read them with `?.`:

```ts
const get = document.paths['/users/{id}']?.get;
get?.responses['200']?.content?.['application/json']?.schema;
```

## Writing it to a file

The document is JSON. A script run at build time, or in CI, writes it
where a client generator, a gateway or a reviewer can read it:

```ts
// scripts/openapi.ts — bun run scripts/openapi.ts
import { openapi } from '@alxia/openapi';
import { app } from '../src/app';

const document = openapi(app, {
	info: { title: 'Users', version: '1.0.0' },
	servers: [{ url: 'https://api.example.com' }],
});
await Bun.write('openapi.json', `${JSON.stringify(document, null, 2)}\n`);
```

Import the app without starting it: export the app from one module, and
call `listen` in another, so the script does not open a port.

## Checking it in a test

Because the document is made from the routes, a test on it catches a
route that lost its schema, or one that should not be public:

```ts
import { describe, expect, test } from 'bun:test';
import { openapi } from '@alxia/openapi';
import { app } from './app';

const document = openapi(app, { info: { title: 'Users', version: '1.0.0' } });

describe('the API contract', () => {
	test('lists the public routes, and only them', () => {
		expect(Object.keys(document.paths)).toEqual(['/users/{id}', '/users']);
	});

	test('every operation declares its replies', () => {
		for (const operations of Object.values(document.paths)) {
			for (const operation of Object.values(operations)) {
				expect(operation?.responses['default']).toBeUndefined();
			}
		}
	});
});
```

A route with no `response` schema is documented with a `default` reply
only, which is what the second test refuses. To fail on any change at all,
compare against the committed file instead:
`expect(document).toEqual(await Bun.file('openapi.json').json())`.

## Related

- [How a route is documented](routes.md) — what each `Operation` holds.
- [Schemas and converters](converters.md) — the `convert` option.
- [Serving the document and its page](serving.md) — `docs`, which calls
  `openapi` for you.
