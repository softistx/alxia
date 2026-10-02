# @alxia/env

Environment variables, validated once at startup with any
[Standard Schema](https://standardschema.dev) — Zod, Valibot, ArkType — and
typed. A missing or malformed variable stops the process with every issue,
not the first request that reads it. No dependency, and no tie to the rest
of alxia.

```sh
bun add @alxia/env
```

## Usage

```ts
import { parseEnv } from '@alxia/env';
import { z } from 'zod';

export const env = parseEnv(
	z.object({
		PORT: z.coerce.number().int().default(3000),
		DATABASE_URL: z.url(),
		LOG_LEVEL: z.enum(['debug', 'info', 'warn']).default('info'),
	}),
);

Bun.serve({ port: env.PORT, fetch: () => new Response(env.LOG_LEVEL) });
```

```
EnvError: The environment is invalid:
  PORT: Invalid input: expected number, received NaN
  DATABASE_URL: Invalid input: expected string, received undefined
```

The result is frozen. `source` defaults to `Bun.env`; pass another object
in a test. The schema must validate synchronously.

## API

| export | |
| --- | --- |
| `parseEnv(schema, source?)` | the variables, checked and typed |
| `EnvError` | thrown with every `issues` entry: `path`, `message` |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/env/docs): how the environment is read, Zod, Valibot and ArkType side by side, coercing strings, defaults, the error at startup, and testing with your own variables.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/env/docs/troubleshooting.md): an error message, or a variable read wrong, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/env/docs/roadmap.md): what is coming, and what is not planned.
