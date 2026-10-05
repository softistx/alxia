---
"@alxia/env": minor
---

`defineEnv(shape, { secret?, source? })`: each variable checked by its own Standard Schema once, typed (a `.default()` is a required key, an `.optional()` an optional one), frozen, and thrown as one `EnvError` listing every missing or invalid variable with its name, message and expected type, never a secret's value. A `secret` prints as `***` through `toJSON`, `inspect` and `toString`. `envExample(env)` and the `alxia-env example` bin generate a `.env.example` from the schema: names, expected types, defaults and descriptions. `app.decorate({ env })` types `ctx.env`, and with `Register`, every `defineRoutes()` route. `parseEnv` is unchanged; `EnvError`'s issues gain an optional `expected`.
