# Troubleshooting

Each entry is headed by the text you see: the error thrown at startup, a
line of an `EnvError`, an error from `tsc`, or — for a trap that prints
nothing — the symptom. The lines of an `EnvError` quoted here are Zod's
wording; Valibot and ArkType say the same thing in other words.

**At startup**

- [`EnvError: The environment is invalid:`](#enverror-the-environment-is-invalid)
- [`PORT: Invalid input: expected number, received string`](#port-invalid-input-expected-number-received-string)
- [`PORT: Invalid input: expected number, received NaN`](#port-invalid-input-expected-number-received-nan)
- [`DATABASE_URL: Invalid input: expected string, received undefined`](#database_url-invalid-input-expected-string-received-undefined)
- [`DEBUG: Invalid option: expected one of "true"|"1"|"yes"|"on"|"y"|"enabled"|"false"|"0"|"no"|"off"|"n"|"disabled"`](#debug-invalid-option-expected-one-of-true1yesonyenabledfalse0nooffndisabled)
- [`(root): Unrecognized keys: "…", "HOME", "PATH", …`](#root-unrecognized-keys--home-path-)
- [`TypeError: parseEnv(): the schema must validate synchronously`](#typeerror-parseenv-the-schema-must-validate-synchronously)
- [`ReferenceError: Bun is not defined`](#referenceerror-bun-is-not-defined)

**At runtime**

- [`DEBUG=false` is read as `true`](#debugfalse-is-read-as-true)
- [`PORT=` is read as `0`, not as the default](#port-is-read-as-0-not-as-the-default)

**Types**

- [`Object literal may only specify known properties, and 'PORT' does not exist in type 'StandardSchema<unknown>'.`](#object-literal-may-only-specify-known-properties-and-port-does-not-exist-in-type-standardschemaunknown)
- [`Argument of type '…' is not assignable to parameter of type 'StandardSchema<unknown>'.`](#argument-of-type--is-not-assignable-to-parameter-of-type-standardschemaunknown)
- [`Type 'number' is not assignable to type 'string'.`](#type-number-is-not-assignable-to-type-string)
- [`Property 'HOME' does not exist on type 'Readonly<{ PORT: number; }>'.`](#property-home-does-not-exist-on-type-readonly-port-number-)
- [`Cannot assign to 'PORT' because it is a read-only property.`](#cannot-assign-to-port-because-it-is-a-read-only-property)

## At startup

### `EnvError: The environment is invalid:`

**When:** the module that calls `parseEnv` is imported, and the schema
refuses at least one variable. The process stops before it listens.

**Why:** that is the package's job: every refused variable is listed below
the first line, one per line, as `<variable>: <the validator's message>`,
so one deploy shows everything that is missing. The entries below cover
the lines you will see most.

**Fix:** set or correct each variable listed. To print the list without the
stack, catch the error and exit:

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

### `PORT: Invalid input: expected number, received string`

**When:** the variable is set, and the schema expects a number (or a
boolean, a date) without converting it.

**Why:** every environment variable is a string. `z.number()` refuses
`'8080'`.

**Fix:** coerce it:

```ts
PORT: z.coerce.number().int().default(3000),
```

### `PORT: Invalid input: expected number, received NaN`

**When:** a variable declared with `z.coerce.number()` is not a number —
`PORT=8o80` — or is not set at all and has no default.

**Why:** coercion runs first: `Number('8o80')` and `Number(undefined)` are
both `NaN`, which the number check refuses. So with coercion, a missing
variable reads `received NaN`, not `received undefined`.

**Fix:** correct the value, or give the variable a default, which applies
before coercion when the variable is unset:

```ts
PORT: z.coerce.number().int().default(3000),
```

### `DATABASE_URL: Invalid input: expected string, received undefined`

**When:** the variable is not set: not exported in the shell, not in a
`.env` file Bun loaded, or a typo in its name.

**Why:** the schema requires it and has no default. Bun loads `.env` files
from the directory the process starts in, so a server started from another
directory does not see them.

**Fix:** set it, or give the schema a default or make it optional:

```ts
DATABASE_URL: z.url().default('postgres://localhost/app'),
SENTRY_DSN: z.url().optional(),
```

### `(root): Unrecognized keys: "…", "HOME", "PATH", …`

Also as `(root): Unrecognized key: "HOME"`, when a single key is extra — in
a test that passes its own `source`, for instance.

**When:** the schema is a strict object — `z.strictObject(...)` or
`.strict()`.

**Why:** `parseEnv` hands the schema the whole environment: `HOME`,
`PATH`, and every other variable of the process. A strict object refuses
the keys it does not declare, in one issue that lists them all. `(root)`
is printed for an issue with no variable to name.

**Fix:** use a plain object, which drops the keys it does not declare:

```ts
parseEnv(z.object({ PORT: z.coerce.number().default(3000) }));
```

### `DEBUG: Invalid option: expected one of "true"|"1"|"yes"|"on"|"y"|"enabled"|"false"|"0"|"no"|"off"|"n"|"disabled"`

**When:** a variable declared with `z.stringbool()` holds anything else:
`DEBUG=maybe`, or `DEBUG=` (empty).

**Why:** `z.stringbool()` reads only the words in the message, in any case
(`TRUE`, `Yes`, `Disabled`), and refuses the rest rather than guess. An
empty variable is `''`, not unset, so its default does not apply.

**Fix:** set one of those words, or unset the variable to get the default:

```ts
DEBUG: z.stringbool().default(false),
```

### `TypeError: parseEnv(): the schema must validate synchronously`

**When:** the schema has an asynchronous refinement or transform —
`.refine(async () => ...)` — anywhere in it.

**Why:** the environment is read once, when the module is imported, before
anything awaits; `parseEnv` returns the variables, not a promise of them.

**Fix:** keep the schema synchronous, and do the asynchronous check — a
database ping, a remote lookup — after `parseEnv`, where the app starts:

```ts
export const env = parseEnv(z.object({ DATABASE_URL: z.url() }));

await checkDatabase(env.DATABASE_URL);
```

### `ReferenceError: Bun is not defined`

**When:** `parseEnv(schema)` runs under a runtime other than Bun, with no
`source`.

**Why:** the default `source` is `Bun.env`.

**Fix:** pass the environment yourself:

```ts
export const env = parseEnv(Env, process.env);
```

## At runtime

### `DEBUG=false` is read as `true`

**When:** a boolean declared with `z.coerce.boolean()`. Nothing is thrown.

**Why:** `z.coerce.boolean()` is `Boolean(value)`, and every non-empty
string is `true`, `'false'` and `'0'` included.

**Fix:** use `z.stringbool()`, which reads `true`/`false`, `1`/`0`,
`yes`/`no`, `on`/`off`, `y`/`n` and `enabled`/`disabled`, in any case, and
refuses anything else:

```ts
DEBUG: z.stringbool().default(false),
```

### `PORT=` is read as `0`, not as the default

**When:** the variable is set but empty — `PORT=` in a `.env` file, or
`PORT= bun start`. Nothing is thrown.

**Why:** an empty variable is `''`, not `undefined`. A default applies
only to `undefined`, and `z.coerce.number()` turns `''` into `0`. A string
schema accepts `''` the same way.

**Fix:** drop the empty variables from the source, so they read as unset:

```ts
const set = Object.fromEntries(
	Object.entries(Bun.env).filter(([, value]) => value !== ''),
);

export const env = parseEnv(Env, set);
```

## Types

### `Object literal may only specify known properties, and 'PORT' does not exist in type 'StandardSchema<unknown>'.`

**When:** `parseEnv({ PORT: z.coerce.number() })`.

**Why:** `parseEnv` takes a schema, not the shape of one.

**Fix:** wrap the shape:

```ts
parseEnv(z.object({ PORT: z.coerce.number() }));
```

### `Argument of type '…' is not assignable to parameter of type 'StandardSchema<unknown>'.`

**When:** the first argument has no `~standard` property: a parse function
such as `Env.parse`, a validator that does not implement Standard Schema,
or a version of one from before it did (Zod before 3.24).

**Why:** `parseEnv` reads the schema through `~standard` alone.

**Fix:** pass the schema itself, from a validator that implements
[Standard Schema](https://standardschema.dev):

```ts
parseEnv(Env);
```

### `Type 'number' is not assignable to type 'string'.`

**When:** a test passes a `source` with a number or a boolean:
`parseEnv(Env, { PORT: 8080 })`.

**Why:** `source` is what the environment holds,
`Record<string, string | undefined>`: strings only, as the schema will see
them in production.

**Fix:** write the values as strings:

```ts
parseEnv(Env, { PORT: '8080' });
```

### `Property 'HOME' does not exist on type 'Readonly<{ PORT: number; }>'.`

**When:** code reads a variable the schema does not declare.

**Why:** the result's type is `Readonly` of the schema's output, and only
what it declares is there. With Zod's `z.object` or Valibot's `v.object`, the
variable is not there at runtime either.

**Fix:** declare it:

```ts
const env = parseEnv(
	z.object({ PORT: z.coerce.number().default(3000), HOME: z.string() }),
);
```

### `Cannot assign to 'PORT' because it is a read-only property.`

**When:** code assigns to a property of the parsed environment:
`env.PORT = 4000`. This is TS2540.

**Why:** the result is frozen with `Object.freeze`, and its type is
`Readonly` of the schema's output, so the assignment would throw
`TypeError: Attempted to assign to readonly property.` at runtime. Both
are shallow: an array or object a transform builds stays mutable.

**Fix:** parse a second environment instead of changing the first. In a
test, pass the variables as `source`:

```ts
const env = parseEnv(Env, { ...Bun.env, PORT: '4000' });
```
