# Roadmap

What `@alxia/env` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/env/CHANGELOG.md).

## Now

Nothing scheduled yet.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **A runtime dependency.** `@alxia/env` declares no dependency and ties
  to no validator: it reads the schema through Standard Schema's
  `~standard`, and its only peer is `typescript`. It does not need
  `@alxia/core` either, and works in any Bun program.

## Shipped

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
