# Setup

## A new app: `bun create @alxia`

```sh
bun create @alxia my-app --template react-router
cd my-app
bun dev
```

[`@alxia/create`](https://www.npmjs.com/package/@alxia/create) copies React
Router's official template with alxia's layer already applied: the steps
of the next section, done.

- `@alxia/core` and `@alxia/react-router` installed, and every dependency
  moved to the newest release alxia accepts (see
  [`@alxia/create`'s Versions](https://github.com/softistx/alxia/blob/develop/packages/create/docs/guide.md#versions));
- `alxia()` in `vite.config.ts`, the `bunfig.toml`, and `start` running
  `NODE_ENV=production bun build/server/index.js`;
- Biome, with `lint`, `format`, `check`, `check:ci` and `verify` scripts;
- a `Dockerfile` that builds on `oven/bun:1` and runs `build/` alone on
  `oven/bun:1-alpine`, as [Deploying](deploying.md#deploying) describes.

`bun run verify` checks, typechecks and builds it.
[`@alxia/create`'s guide](https://github.com/softistx/alxia/blob/develop/packages/create/docs/guide.md#running-it)
lists the command's options. The template keeps `@react-router/serve` in its
dependencies, unused: remove it if you like.

## An existing React Router app

Start from React Router's official template, or your own app:

```sh
bunx create-react-router@latest my-app
cd my-app
```

Then make three changes.

**1. Install** alxia and this package:

```sh
bun add @alxia/core @alxia/react-router
```

**2. Add `alxia()`** to the plugins in `vite.config.ts`:

```ts
// vite.config.ts
import { alxia } from '@alxia/react-router/vite';
import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [tailwindcss(), reactRouter(), alxia()],
	resolve: {
		tsconfigPaths: true,
	},
});
```

The order does not matter. The plugin always runs before React Router's:
React Router's build reads its server input from it, and its dev
middleware must come after alxia's.

**3. Start with Bun**, in `package.json`:

```jsonc
"scripts": {
	"build": "react-router build",
	"dev": "react-router dev",
	"start": "NODE_ENV=production bun build/server/index.js",
	"typecheck": "react-router typegen && tsc"
}
```

Only `start` changes. The `react-router` and `vite` CLIs start with
`#!/usr/bin/env node`, so where a node is installed `bun run` would run
them on Node, and alxia's server needs Bun. A `bunfig.toml` beside
`package.json` makes `bun run` start them on Bun, for every script:

```toml
# bunfig.toml, beside package.json
[run]
bun = true
```

Then `bun run dev`, `bun run build` and `bun run typecheck` work as they
are, with or without a node installed. Without that file, run them as
`bun --bun react-router dev`. The plugin refuses a dev or preview server
running on Node at startup, rather than failing on the first request:
see [the troubleshooting entry](../troubleshooting.md#alxia-react-router--is-running-on-node-and-alxias-server-runs-on-bun-). The
template's `@react-router/serve` is no longer used, and you can remove it.

What the template keeps:

- `@react-router/node`, which React Router's default `entry.server`
  renders with: it streams under Bun.
- Vite 7 or 8 (the template ships 8).
- With `bunx create-react-router`, its `typescript` 5.9. This package's
  peer asks for 6 or 7, so `bun add` warns, but the template's code
  typechecks with 5.9. `bun add -d typescript@^6` silences the warning;
  `bun create @alxia` writes 6 or 7 already.

React Router 8 is required: its loaders receive a `RouterContextProvider`,
and alxia's context is set on it.
