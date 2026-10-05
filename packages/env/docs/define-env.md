# `defineEnv`

This page covers `defineEnv`: the environment checked once, each variable by
its own schema, with secrets redacted and a `.env.example` generated from the
same schema. It starts with the app's context, then `@alxia/graphql`, `.env`
and Docker, secrets and the example file. [The guide](guide.md) covers
`parseEnv`, which checks one object schema, and how each validator turns
strings into values; every schema in it works here as a variable's schema.

```ts
// src/env.ts
import { defineEnv } from '@alxia/env';
import { z } from 'zod';

export const env = defineEnv(
	{
		DATABASE_URL: z.url(),
		PORT: z.coerce.number().default(3000),
		API_KEY: z.string().min(1).describe('Key of the billing provider'),
		SENTRY_DSN: z.url().optional(),
	},
	{ secret: ['API_KEY', 'DATABASE_URL'] },
);
```

```ts
function defineEnv<Shape extends Record<string, StandardSchema<unknown>>>(
	shape: Shape,
	options?: {
		secret?: (keyof Shape & string)[]; // printed as '***', kept out of errors
		source?: Record<string, string | undefined>; // Bun.env by default
	},
): Env<Shape>;
```

| Schema | Key in `env` |
| --- | --- |
| `z.coerce.number().default(3000)` | `PORT: number`, required: the default fills it |
| `z.url().optional()` | `SENTRY_DSN?: string \| undefined`, and absent from `env` when unset |
| `z.url()` | `DATABASE_URL: string`; unset, `defineEnv` throws |

`defineEnv` reads `source[name]` for each name in the shape and gives it to
that name's schema alone, so a variable the shape does not declare is not in
`env`, with any validator. It runs once, when the module is imported. Any
[Standard Schema](https://standardschema.dev) works, a different one per
variable if you like: Zod, Valibot, ArkType.

## The app's context: `decorate({ env })`

Decorate the base once, register it, and every route and plugin reads
`ctx.env`, typed:

```ts
// src/context.ts
import { alxia } from '@alxia/core';
import { env } from './env';

export const base = alxia().decorate({ env });

declare module '@alxia/core' {
	interface Register {
		context: typeof base;
	}
}
```

```ts
// src/routes/health.ts: no import of the app, nor of the env
import { defineRoutes } from '@alxia/core';

export const health = defineRoutes().get('/health', ({ env, reply }) =>
	reply(200, { port: env.PORT }),
);
```

`defineRoutes()` reads the registered context, so `env.PORT` is a `number`
and `env.SENTRY_DSN` a `string | undefined`, and a variable the shape does not
declare is a compile error. A middleware, which may be given to a route before
`base` adds anything, reads `BaseContext` unless it names the registered
context:

```ts
import { type AppContext, defineMiddleware } from '@alxia/core';

export const withPort = defineMiddleware<AppContext>()(({ env }, next) =>
	next({ port: env.PORT }),
);
```

Outside a request, a module imports `env` itself.

## With `@alxia/graphql`

A resolver's context holds every `decorate` of the app, so `env` is there
with its types:

```ts
import { alxia } from '@alxia/core';
import { type GraphQLContext, graphql } from '@alxia/graphql';
import { createSchema } from 'graphql-yoga';
import { env } from './env';

const base = alxia().decorate({ env });

const schema = createSchema<GraphQLContext<typeof base>>({
	typeDefs: /* GraphQL */ `type Query { port: Int! }`,
	resolvers: { Query: { port: (_, __, { env }) => env.PORT } }, // number
});

export const app = base.plugin((app) => graphql(app, { schema }));
```

The secrets are redacted in the context as everywhere else, so a resolver
that logs its context does not log them.

## Secrets

Name a variable in `secret` and it is `'***'` wherever `env` is printed:

```ts
console.log(env); // { DATABASE_URL: '***', PORT: 3000, API_KEY: '***', ... }
JSON.stringify(env); // '{"DATABASE_URL":"***","PORT":3000,"API_KEY":"***"}'
String(env); // the same as console.log
env.API_KEY; // 'sk-live-...': the value, to use
```

`toJSON`, `inspect` and `toString` are on the object and are not enumerable,
so a logger that serialises `env` or `ctx` through `JSON.stringify` or
`console.log` prints the redacted copy. A copy you make, `{ ...env }` or
`Object.entries(env)`, holds the real values: do not log one.

The error never prints a secret either. A validator may quote the value it
refused (`Invalid URL: Received "…"`): for a secret, `defineEnv` replaces that
value with `***` in every message and in `error.issues`, and the missing ones
say `received undefined`. A variable that is not a secret keeps the
validator's message whole.

## `.env`, Docker and the platform

`Bun.env` is the environment of the process plus the `.env` files Bun loads
from the directory it starts in (`.env`, `.env.local`, `.env.<NODE_ENV>`); a
variable of the process wins over a file. So `bun --env-file=.env.staging
src/server.ts` and a plain `.env` both work with no code.

An image holds the bundle alone: it has no `.env`, and should not (keep it in
`.dockerignore`). Hand the variables to the container, where `defineEnv`
reads them at startup and a missing one stops it with the full list:

```sh
docker run --env-file .env.production -p 3000:3000 my-api
docker run -e DATABASE_URL -e API_KEY my-api   # forwards the shell's values
```

A container that exits at once with an `EnvError` is that list in
`docker logs`. In Compose, `env_file:` and `environment:` do the same.

## `.env.example`

`envExample(env)` writes the file from the schema: each name, the
expected type, whether it is required, its default, and the description when
the schema carries one (Zod's `.describe()`, Valibot's `v.description()`). A
secret's default is never written, and a variable without a default is empty,
or commented out when it is optional.

```sh
bunx alxia-env example > .env.example          # src/env.ts
bunx alxia-env example apps/api/src/env.ts     # another module
```

```
# Key of the billing provider
# string, required, secret
API_KEY=

# number, optional, default 3000
PORT=3000

# string (url), optional
# SENTRY_DSN=
```

The bin imports the module only for its schema: nothing has to be set, and it
refuses nothing. To keep the file from drifting, compare it in a test:

```ts
import { expect, test } from 'bun:test';
import { envExample } from '@alxia/env';
import { env } from './env';

test('.env.example is the schema', async () => {
	expect(envExample(env)).toBe(await Bun.file('.env.example').text());
});
```

The expected type is read from Zod, Valibot and ArkType's own definitions, as
well as they allow; a schema it cannot read gets no type on its line, and no
`expected …` in an error.

## Testing

```ts
const env = defineEnv(shape, { source: { DATABASE_URL: 'postgres://x', API_KEY: 'k' } });
```

`source` replaces `Bun.env`: the test sets what it checks, and a missing
variable is an `EnvError` it can assert on, by `error.issues`:
`{ path: 'API_KEY', message: '…', expected: 'string' }`.
Export the shape from the module beside `env` to build another one per case.

When something goes wrong, the message is a heading in
[Troubleshooting](troubleshooting.md).
