# @alxia/react-router

[alxia](https://www.npmjs.com/package/@alxia/core) as the HTTP server of a
[React Router](https://reactrouter.com) framework app, server rendered,
under Bun. The pages are a catch-all route behind the app's hooks — logger,
compression, sessions, guards — and each loader, action and middleware
reads what those hooks built, typed by the app. alxia's own routes, an
`/api`, live beside the pages, and the client build's files are served with
the cache each one deserves.

```sh
bun add @alxia/react-router @alxia/core react-router
bun add -d typescript
```

`@alxia/core` and `react-router` 8 are peers: the package declares no
dependency. React, `@react-router/dev`, Vite and `isbot` are the app's, as
in any React Router app; the package never imports them.

## Serving a build

The example uses `@alxia/logger` (`bun add @alxia/logger`); any plugin
works the same way.

```ts
// server.ts
import { alxia } from '@alxia/core';
import { logger } from '@alxia/logger';
import { reactRouter } from '@alxia/react-router';
import type { ServerBuild } from 'react-router';

export const base = alxia()
	.use(logger())
	.get('/api/health', ({ reply }) => reply.ok({ ok: true }))
	.derive(({ cookies }) => {
		const name = cookies.get('user');
		return { user: name === null ? null : { name } };
	});

export type Base = typeof base;

const app = base.use((app) =>
	reactRouter(app, {
		build: () => import('./build/server/index.js') as Promise<ServerBuild>,
		client: 'build/client',
	}),
);

app.listen(Number(process.env.PORT ?? 3000));
```

```sh
bunx --bun react-router build && bun server.ts
```

`reactRouter()` is called through `use`, so it reads the app's context
type. It declares `GET`, `POST`, `PUT`, `PATCH` and `DELETE` at `/*`, behind
every hook declared before it, and the app's own routes answer their
paths wherever they are declared; a `HEAD` is handed to React
Router as its `GET`, and the core drops the body.

## Reading the context in a loader

```ts
// app/routes/dashboard.tsx
import { alxiaOf } from '@alxia/react-router';
import type { Base } from '../../server';
import type { Route } from './+types/dashboard';

export function loader({ context }: Route.LoaderArgs) {
	const { user, log } = alxiaOf<Base>(context); // typed: what `base` built
	log.info('dashboard');
	return { name: user?.name ?? 'anonymous' };
}
```

Pass the type of the app **before** the catch-all, imported with `import
type`. Reading a key no hook derives, or the type of something that is not
an app, is a compile error. The key, `alxiaContext`, lives in this
package, so the server and React Router's build share it; a key made in
the app's own `app/` folder is copied into the build, and the server's
`context.set` never reaches it. `getLoadContext(ctx, context)` sets such
keys on React Router's provider, `ctx` typed by the app.

## The client's files

With `client`, the folder `react-router build` wrote, `build/client`, is
served before the catch-all:

| path | `Cache-Control` |
| --- | --- |
| `/assets/*`, the hashed bundles | `public, max-age=31536000, immutable` |
| every other top-level file or folder, the copies of `public/` | `public, max-age=3600` |

A missing asset is alxia's JSON 404, not a page. In `development` the
option is ignored: Vite serves them.

## Leaving the pages out of OpenAPI

```ts
import { docs } from '@alxia/openapi';
import { isReactRouterRoute } from '@alxia/react-router';

app.use(docs(app, { info: { title: 'Shop', version: '1.0.0' }, exclude: isReactRouterRoute }));
```

The catch-all adds nothing to the app's route table, so the typed client
never shows it. `isReactRouterRoute` names it, and the client files, for
`@alxia/openapi`.

## Traps

- **A context key made in `app/` is not the one the loaders read**: React
  Router's build holds its own copy, and the loader gets the default or
  `Error: No value found for context`. Read alxia's context with
  `alxiaOf`. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#error-no-value-found-for-context)
- **In a monorepo, Vite bundles a linked `@alxia/react-router`** into the
  build, with a second `alxiaContext`: `alxiaOf` then throws. Add
  `ssr: { external: ['@alxia/react-router'] }` to `vite.config.ts`. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#alxiaof-this-request-has-no-alxia-context-)
- **Bun's user agent is a bot to `isbot`**, so a test client gets the
  finished page, never a stream. Send a browser's `user-agent`. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#a-streamed-page-arrives-in-one-piece)
- **An index route's action is `POST /?index`**; `POST /` is React
  Router's 405. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#you-made-a-post-request-to--but-did-not-provide-an-action-for-route-root-so-there-is-no-way-to-handle-the-request)
- **`@alxia/secure-headers`' default policy blocks the page's scripts**
  and forms: give the pages a policy of their own. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#refused-to-execute-inline-script-because-it-violates-the-following-content-security-policy-directive-default-src-none)
- **An alxia route whose path covers a page takes it**, wherever it is
  declared: `GET /:slug` answers `/about`. Keep alxia's routes under
  `/api`. [More](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#a-page-answers-alxias-json-404-or-405-instead-of-rendering)

## API

| export | |
| --- | --- |
| `reactRouter(app, options)` | the catch-all and the client's files. `build`, `mode`, `getLoadContext`, `client` |
| `ReactRouterOptions<Ctx>` | its options |
| `alxiaOf<App>(context)` | what alxia's hooks built, in a loader, an action or a middleware, typed as `ContextOf<App>` |
| `alxiaContext` | the React Router context key it reads, set on every request |
| `isReactRouterRoute(route)` | whether `reactRouter()` declared a route, for OpenAPI's `exclude` |

## Documentation

- [Guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md): the setup, the server entry, loaders reading the context, the client's files, OpenAPI, and testing.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md): each message, and the traps that print none.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/roadmap.md): what is coming, and what is not planned.
