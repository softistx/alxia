# @alxia/env

Environment variables, validated once at startup with any
[Standard Schema](https://standardschema.dev) — Zod, Valibot, ArkType — and
typed. A missing or malformed variable stops the process with every issue,
not the first request that reads it; a secret is never printed. No
dependency, and no tie to the rest of alxia.

```sh
bun add @alxia/env
bun add -d typescript
```

## In 30 seconds

```ts
// src/env.ts
import { defineEnv } from '@alxia/env';
import { z } from 'zod';

export const env = defineEnv(
	{
		DATABASE_URL: z.url(),
		PORT: z.coerce.number().default(3000),
		API_KEY: z.string().min(1),
	},
	{ secret: ['API_KEY', 'DATABASE_URL'] },
);

env.PORT; // number: validated once, when this module is imported, from Bun.env
console.log(env); // { DATABASE_URL: '***', PORT: 3000, API_KEY: '***' }
```

With alxia, give it to the context once and read `ctx.env` everywhere:

```ts
export const base = alxia().decorate({ env });
```

Left unset, the process stops before it listens, with every variable at once
and never a secret's value:

```
EnvError: The environment is invalid:
  DATABASE_URL: Invalid input: expected string, received undefined; expected string (url)
  API_KEY: Invalid input: expected string, received undefined; expected string
```

## Usage

- **Typed from the schema.** A schema with `.default()` is a required key, one
  with `.optional()` an optional key (`SENTRY_DSN?: string | undefined`).
- **Secrets are redacted** by `toJSON`, `inspect` and `toString`: `console.log(env)`,
  `JSON.stringify(env)` and a logger show `'***'`, while `env.API_KEY` is the value.
- **Test it** with a `source`, which leaves `Bun.env` alone:

```ts
const env = defineEnv({ PORT: z.coerce.number().default(3000) }, { source: {} });
env.PORT; // 3000
```

- **A `.env.example`** from the same schema:

```sh
bunx alxia-env example > .env.example   # reads src/env.ts; or: alxia-env example path/to/env.ts
```

```ts
import { envExample } from '@alxia/env';

expect(envExample(env)).toBe(await Bun.file('.env.example').text()); // no drift
```

```
# Where the data lives
# string (url), required
DATABASE_URL=

# number, optional, default 3000
PORT=3000
```

`parseEnv(schema, source?)` checks one object schema (`z.object({...})`) the same way, with every
issue in one `EnvError`, and no redaction nor example.

## API

| export | |
| --- | --- |
| `defineEnv(shape, { secret?, source? })` | each variable checked by its own schema, once; typed, frozen, secrets redacted |
| `envExample(env)` | the `.env.example` of an `env`: names, expected types, defaults, descriptions |
| `parseEnv(schema, source?)` | one object schema over the whole environment: typed and frozen |
| `EnvError` | thrown with every `issues` entry: `path`, `message`, `expected?` |
| `Env<Shape>`, `EnvShape`, `DefineEnvOptions<Shape>` | the types |
| `alxia-env example [module]` | the bin: prints `envExample` of each `defineEnv` in `module` (`src/env.ts`) |

Schemas must validate synchronously.

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/env/docs): `defineEnv` with alxia's `Register` and `@alxia/graphql`, secrets, `.env` and Docker, the `.env.example`; and `parseEnv`, Zod, Valibot and ArkType side by side, coercing strings, defaults, and testing with your own variables.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/env/docs/troubleshooting.md): an error message, or a variable read wrong, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/env/docs/roadmap.md): what is coming, and what is not planned.
