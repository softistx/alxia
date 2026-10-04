# @alxia/openapi-routes

**Deprecated: moved to [`@alxia/openapi`](https://www.npmjs.com/package/@alxia/openapi).**
alxia is OpenAPI spec first, and the package that checks an app's routes
against the operations of its document now carries that name. This last release
re-exports it, so an app that still imports `@alxia/openapi-routes` keeps
working, with every export marked deprecated.

## Moving

```sh
bun remove @alxia/openapi-routes
bun add -d @alxia/openapi
```

Then change the import, nothing else:

```ts
// before
import { implemented, matchesSpec } from '@alxia/openapi-routes';
// after
import { implemented, matchesSpec } from '@alxia/openapi';
```

The functions are the same ones, with the same options and messages.

## Peers

This release imports `@alxia/openapi`, so it needs it installed beside it,
with `@alxia/core` and `typescript`, as `@alxia/openapi` does. Bun installs
missing peers by itself.

```sh
bun add -d @alxia/openapi-routes @alxia/openapi typescript
```

## API

| export | |
| --- | --- |
| `implemented`, `matchesSpec`, `exactly` | deprecated: `@alxia/openapi`'s own, re-exported |
| `Operations`, `ImplementedOptions`, `MatchesSpecOptions`, `ExactlyOptions` | deprecated: `@alxia/openapi`'s types, re-exported |

## Documentation

`@alxia/openapi`'s
[README](https://github.com/softistx/alxia/blob/develop/packages/openapi/README.md)
and [docs](https://github.com/softistx/alxia/tree/develop/packages/openapi/docs):
the spec-first workflow, the checks, troubleshooting and the roadmap. The
history of this package is in its
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/openapi-routes/CHANGELOG.md).
