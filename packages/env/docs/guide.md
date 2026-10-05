# Guide

[`defineEnv`](define-env.md) is the form to start from: one schema per
variable, secrets redacted, a `.env.example` from the schema. This page covers
`parseEnv`, which checks one object schema over the whole environment, and
what both share: how the environment is read, how a schema turns its strings
into typed values, what is thrown when one is wrong, and how to test a module
that reads it.

```ts
import { parseEnv } from '@alxia/env';
import { z } from 'zod';

export const env = parseEnv(
	z.object({
		PORT: z.coerce.number().int().default(3000),
		DATABASE_URL: z.url(),
	}),
);

env.PORT; // number
env.DATABASE_URL; // string
```

Put it in its own module (`src/env.ts`) and import `env` wherever a
variable is needed: the check runs once, when the module is first
imported, before the server starts.

## The signature

```ts
function parseEnv<Schema extends StandardSchema<unknown>>(
	schema: Schema,
	source?: Record<string, string | undefined>, // Bun.env by default
): Readonly<OutputOf<Schema>>;

class EnvError extends Error {
	readonly name: 'EnvError';
	readonly issues: readonly {
		readonly path: string;
		readonly message: string;
		readonly expected?: string; // defineEnv only, when the schema tells
	}[];
}
```

| Parameter | Type | Default | Effect |
| --- | --- | --- | --- |
| `schema` | any [Standard Schema](https://standardschema.dev) | — | checks the variables and converts them; its output type is what `parseEnv` returns |
| `source` | `Record<string, string \| undefined>` | `Bun.env` | the variables to check: pass an object in a test, or `process.env` |

`StandardSchema` and `OutputOf` are exported as types: any value with a
`~standard` property is accepted, and the result is the schema's output
type — the type after its defaults and transforms, not its input.

## How the environment is read

`parseEnv` copies `source` into a plain object and hands the whole of it to
the schema. Every value in it is a string, or `undefined` for a variable
that is not set. The schema decides what to keep and what each value
becomes.

`Bun.env` is the default source. Bun fills it from the process's
environment and from the `.env` files it loads at startup (`.env`,
`.env.local`, and the one for `NODE_ENV`, such as `.env.production`),
so a variable set in a `.env` file is read with no extra step:

```sh
# .env
PORT=8080
DATABASE_URL=postgres://localhost/app
```

What comes back is the schema's output, frozen with `Object.freeze` and
typed `Readonly`:

```ts
import { parseEnv } from '@alxia/env';
import { z } from 'zod';

const env = parseEnv(z.object({ PORT: z.coerce.number() }), { PORT: '8080' });

Object.isFrozen(env); // true
// @ts-expect-error TS2540: Cannot assign to 'PORT' because it is a read-only property.
env.PORT = 1; // and at runtime, TypeError: Attempted to assign to readonly property.
```

The freeze and the type are both shallow: an array or object a transform
builds stays mutable — see
[Troubleshooting](troubleshooting.md#cannot-assign-to-port-because-it-is-a-read-only-property).

Which other variables come back depends on the validator. Zod's
`z.object` and Valibot's `v.object` drop every key they do not declare;
ArkType's `type({...})` and Zod's `z.looseObject` keep them at runtime,
though the type still names only the declared ones. Either way, read only
what the schema declares.

## Any Standard Schema

`parseEnv` reads the schema through `~standard` and nothing else, so the
package depends on no validator. The same environment, three ways:

```ts
import { parseEnv } from '@alxia/env';
import { z } from 'zod';

export const env = parseEnv(
	z.object({
		PORT: z.coerce.number().int().default(3000),
		DATABASE_URL: z.url(),
	}),
);
```

```ts
import { parseEnv } from '@alxia/env';
import * as v from 'valibot';

export const env = parseEnv(
	v.object({
		PORT: v.optional(
			v.pipe(v.string(), v.transform(Number), v.integer()),
			'3000',
		),
		DATABASE_URL: v.pipe(v.string(), v.url()),
	}),
);
```

```ts
import { parseEnv } from '@alxia/env';
import { type } from 'arktype';

export const env = parseEnv(
	type({
		PORT: type('string.integer.parse').default('3000'),
		DATABASE_URL: 'string.url',
	}),
);
```

Each gives `{ PORT: number; DATABASE_URL: string }`. The validator is the
consumer's own dependency: `bun add zod`, `bun add valibot` or
`bun add arktype`.

The schema must validate synchronously. An asynchronous refinement makes
`parseEnv` throw a `TypeError` instead of waiting, since the environment is
read before anything awaits — see
[Troubleshooting](troubleshooting.md#typeerror-parseenv-the-schema-must-validate-synchronously).

## Turning strings into values

Every variable arrives as a string. A schema that expects a number refuses
`'8080'`; it has to convert it first. With Zod, `z.coerce` does:

```ts
import { parseEnv } from '@alxia/env';
import { z } from 'zod';

const env = parseEnv(
	z.object({
		PORT: z.coerce.number().int(), // '8080' → 8080, 'x' → refused (NaN)
		TIMEOUT_MS: z.coerce.number().positive(),
	}),
	{ PORT: '8080', TIMEOUT_MS: '5000' },
);
```

**Booleans** need care: `z.coerce.boolean()` is `Boolean(value)`, and every
non-empty string, `'false'` included, is `true`. Use `z.stringbool()`,
which reads `true`/`false`, `1`/`0`, `yes`/`no`, `on`/`off`, `y`/`n` and
`enabled`/`disabled`, in any case, and refuses the rest — the empty string
included — or list the two values and transform them:

```ts
import { parseEnv } from '@alxia/env';
import { z } from 'zod';

const env = parseEnv(
	z.object({
		DEBUG: z.stringbool().default(false),
		CACHE: z
			.enum(['true', 'false'])
			.transform((value) => value === 'true')
			.default(false),
	}),
	{ DEBUG: 'false', CACHE: 'true' },
);
// { DEBUG: false, CACHE: true }
```

**Lists** are a string split, then checked item by item:

```ts
import { parseEnv } from '@alxia/env';
import { z } from 'zod';

const env = parseEnv(
	z.object({
		ALLOWED_ORIGINS: z
			.string()
			.transform((value) => value.split(','))
			.pipe(z.array(z.url())),
	}),
	{ ALLOWED_ORIGINS: 'https://app.example.com,https://admin.example.com' },
);
// env.ALLOWED_ORIGINS: string[]
```

A refused item is named by its index: `ALLOWED_ORIGINS.1: Invalid URL`.

**An empty variable is a string too.** `PORT=` in a `.env` file gives
`''`, not `undefined`: a default does not apply, and `z.coerce.number()`
turns `''` into `0`. To treat an empty variable as unset, drop the empty
ones from the source:

```ts
import { parseEnv } from '@alxia/env';
import { z } from 'zod';

const set = Object.fromEntries(
	Object.entries(Bun.env).filter(([, value]) => value !== ''),
);

export const env = parseEnv(
	z.object({ PORT: z.coerce.number().int().default(3000) }),
	set,
);
```

## Defaults and optional variables

A default fills a variable that is not set (`undefined`); an optional
variable stays `undefined` and its type says so:

```ts
import { parseEnv } from '@alxia/env';
import { z } from 'zod';

const env = parseEnv(
	z.object({
		LOG_LEVEL: z.enum(['debug', 'info', 'warn']).default('info'),
		SENTRY_DSN: z.url().optional(),
	}),
	{},
);
// { LOG_LEVEL: 'info' } — env.SENTRY_DSN: string | undefined
```

The default is the schema's output, after coercion: `.default(3000)` on
`z.coerce.number()`, `.default(false)` on `z.stringbool()`. Valibot's
`v.optional(schema, default)` and ArkType's `.default(...)` take the
*input*, a string, which then goes through the pipe — `'3000'` in the
example above.

A variable that depends on another is checked on the whole object. Its
issue has no variable to name, and is printed as `(root)`:

```ts
import { parseEnv } from '@alxia/env';
import { z } from 'zod';

const env = parseEnv(
	z
		.object({
			TLS_CERT: z.string().optional(),
			TLS_KEY: z.string().optional(),
		})
		.refine(
			(value) => (value.TLS_CERT === undefined) === (value.TLS_KEY === undefined),
			'TLS_CERT and TLS_KEY go together',
		),
	{ TLS_CERT: '/etc/tls/cert.pem', TLS_KEY: '/etc/tls/key.pem' },
);
```

## The error at startup

When the schema refuses anything, `parseEnv` throws one `EnvError` listing
every refused variable — not the first one — in the schema's order:

```
EnvError: The environment is invalid:
  PORT: Invalid input: expected number, received NaN
  DATABASE_URL: Invalid input: expected string, received undefined
```

Each line is a variable's `path` and the validator's own message, so the
wording is Zod's, Valibot's or ArkType's. The same issues are on
`error.issues`:

```ts
import { EnvError, parseEnv } from '@alxia/env';
import { z } from 'zod';

try {
	parseEnv(z.object({ PORT: z.coerce.number(), DATABASE_URL: z.url() }), {
		PORT: 'x',
	});
} catch (error) {
	if (error instanceof EnvError) {
		error.issues;
		// [
		//   { path: 'PORT', message: 'Invalid input: expected number, received NaN' },
		//   { path: 'DATABASE_URL', message: 'Invalid input: expected string, received undefined' },
		// ]
	}
}
```

| `path` | When |
| --- | --- |
| `'PORT'` | a variable was refused |
| `'ALLOWED_ORIGINS.1'` | an item inside a transformed value; the keys are joined with `.` |
| `''` (printed `(root)`) | the whole object was refused: a `.refine` on it, or an unknown key with a strict object |

Left uncaught, the error stops the process before it listens, with a
non-zero exit code, which is the point: a deploy with a missing variable
fails at once instead of on the first request that reads it. To print only
the list, without the stack:

```ts
import { EnvError, parseEnv } from '@alxia/env';
import { z } from 'zod';

const Env = z.object({ DATABASE_URL: z.url() });

function loadEnv() {
	try {
		return parseEnv(Env);
	} catch (error) {
		if (error instanceof EnvError) {
			console.error(error.message);
			process.exit(1);
		}
		throw error;
	}
}

export const env = loadEnv();
```

## Testing with a custom source

Pass the variables as the second argument: the test does not touch
`Bun.env`, and each case states the environment it checks.

```ts
import { describe, expect, test } from 'bun:test';
import { EnvError, parseEnv } from '@alxia/env';
import { z } from 'zod';

const Env = z.object({
	PORT: z.coerce.number().int().default(3000),
	DATABASE_URL: z.url(),
});

describe('env', () => {
	test('defaults the port', () => {
		const env = parseEnv(Env, { DATABASE_URL: 'postgres://localhost/db' });
		expect(env).toEqual({ PORT: 3000, DATABASE_URL: 'postgres://localhost/db' });
	});

	test('names every refused variable', () => {
		try {
			parseEnv(Env, { PORT: 'x' });
			throw new Error('expected an EnvError');
		} catch (error) {
			expect(error).toBeInstanceOf(EnvError);
			expect((error as EnvError).issues.map((issue) => issue.path)).toEqual([
				'PORT',
				'DATABASE_URL',
			]);
		}
	});
});
```

Export the schema rather than only the parsed `env`, so a spec can check it
against any source without importing a module that reads the real
environment.

## A realistic setup

One module owns the schema and the parsed result; the rest of the app
imports from it.

```ts
// src/env.ts
import { parseEnv } from '@alxia/env';
import { z } from 'zod';

export const Env = z.object({
	NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
	PORT: z.coerce.number().int().min(1).max(65535).default(3000),
	DATABASE_URL: z.url(),
	ALLOWED_ORIGINS: z
		.string()
		.transform((value) => value.split(','))
		.pipe(z.array(z.url()))
		.default([]),
	LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
	DEBUG: z.stringbool().default(false),
});

export type Env = z.output<typeof Env>;

export const env = parseEnv(Env);
```

```ts
// src/server.ts
import { env } from './env';

Bun.serve({
	port: env.PORT,
	fetch: () => new Response(env.NODE_ENV),
});
```

`Env`, the type, is what a function that takes the configuration as a
parameter declares, so it can be called with a test's values instead of the
module's.

When something goes wrong, the message is a heading in
[Troubleshooting](troubleshooting.md).
