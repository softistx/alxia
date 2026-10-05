# Roadmap

What `@alxia/env` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/env/CHANGELOG.md).

## Now

Nothing scheduled yet.

## Next

- **A description from every validator.** `envExample` reads a variable's
  type and description from Zod, Valibot and ArkType's definitions. When
  Standard Schema gets a JSON Schema form, it reads that, and any validator
  that implements it is described.

## Later

Nothing scheduled yet.

## Not planned

- **A runtime dependency.** `@alxia/env` declares no dependency and ties
  to no validator: it reads the schema through Standard Schema's
  `~standard`, and its only peer is `typescript`. It does not need
  `@alxia/core` either, and works in any Bun program.

## Shipped

### 0.2.0

- **`defineEnv(shape, { secret?, source? })`.** One schema per variable, checked
  once when the module is imported, from `Bun.env` or a `source`. A `.default()` is a
  required key, an `.optional()` an optional one. `app.decorate({ env })` gives it to
  `ctx.env`, typed in every route through `Register`.
- **Secrets.** A variable in `secret` is `'***'` through `toJSON`, `inspect` and
  `toString`, and a validator's message never carries its value.
- **Every issue, with its expected type.** An `EnvIssue` is `path`, `message` and,
  when the schema tells, `expected`.
- **`envExample(env)` and `bunx alxia-env example`.** A `.env.example` from the schema:
  names, expected types, defaults and descriptions, no secret's default.

### 0.1.0

- **The environment, checked once at startup.** `parseEnv(schema)` reads
  `Bun.env` when the module is imported, so a missing or malformed
  variable stops the process before it listens, not on the first request
  that reads it.
- **Any Standard Schema.** Zod, Valibot, ArkType: the result is typed as
  the schema's output, its defaults and coercions applied.
- **Every issue at once.** An `EnvError` lists each refused variable with
  the validator's message, in its message and in `issues`.
- **Frozen, and testable.** The result is frozen, and typed `Readonly`; a
  second argument replaces `Bun.env`, for a test or another runtime.
