# @alxia/create

Start an [alxia](https://github.com/softistx/alxia) app in one command: an
API with Zod, or React Router's official template served by alxia.

```sh
bun create @alxia my-app
```

`bun create @alxia` runs this package's bin, as `bun create <name>` runs
`create-<name>` and `bun create @scope` runs `@scope/create`. It asks for
what it is not given, writes the project, installs it and prints the next
steps:

```sh
cd my-app
bun dev
```

It needs Bun 1.4.2 or later, which the projects it writes run on.

## Templates

```sh
bun create @alxia my-api --template api
bun create @alxia my-site --template react-router
```

| template | what it writes |
| --- | --- |
| `api` | an `@alxia/core` app with Zod: `POST /todos` validates its body, behind `requireKey`, a hook made with `defineHook` that answers 401 without an API key; a `bun test` spec calling it with `app.request()` and through `@alxia/client`, typed; `bun dev` restarting on change, `typecheck`, `build`, a strict `tsconfig.json`, a `Dockerfile` on `oven/bun:1`, `.dockerignore`, `.gitignore`, `.env.example` and a README |
| `react-router` | React Router's official template, as `create-react-router` writes it, shipped in this package and copied, with [`@alxia/react-router`](https://www.npmjs.com/package/@alxia/react-router) added as its README says: `alxia()` in `vite.config.ts`'s plugins, `start` running `bun build/server/index.js`, a `bunfig.toml` starting React Router's CLI on Bun, and a `Dockerfile` on `oven/bun:1` in place of React Router's Node one. No server file: the default one serves the pages; `bunx alxia-react-router reveal` writes it out to customise |

The heart of the `api` project, its route and hook (the whole file, with
its imports and schemas, is in the [guide](https://github.com/softistx/alxia/blob/develop/packages/create/docs/guide.md#the-api-template)):

```ts
// src/app.ts, in part
const requireKey = defineHook(({ request, reply }) =>
	request.headers.get('x-api-key') === apiKey
		? undefined
		: reply(401, { error: 'unauthorized' as const }),
);

export const app = alxia()
	.decorate({ todos })
	.post('/todos', [requireKey], { body: NewTodo, response: { 201: Todo } }, ({ body, todos, reply }) => {
		const todo = { id: todos.length + 1, title: body.title, done: false };
		todos.push(todo);
		return reply.created(todo);
	});
```

## Docker

Both projects build into an image as they are written, on `oven/bun:1`,
the image running the app as the non-root `bun` user. Each `Dockerfile`
builds in a stage of its own, and the image holds the build output alone,
no `node_modules`:

- `api`: `bun run build` bundles `src/server.ts` and its dependencies into
  `dist/server.js`; the image holds `dist/` and runs `bun dist/server.js`.
- `react-router`: `bun run build`, every dependency bundled into
  `build/server/index.js` by `@alxia/react-router`'s plugin; the image
  holds `build/` and runs `bun build/server/index.js`.

```sh
cd my-api
docker build -t my-api .
docker run -p 3000:3000 -e API_KEY=change-me my-api
```

```sh
cd my-site
docker build -t my-site .
docker run -p 3000:3000 my-site
```

Commit the `bun.lock` that `bun install` wrote: the image installs from it
with `--frozen-lockfile`. The
[guide](https://github.com/softistx/alxia/blob/develop/packages/create/docs/guide.md#docker)
has the stages, and
[troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/create/docs/troubleshooting.md#error-cannot-find-package--from-appdistserverjs)
what to do for a dependency that cannot be bundled.

## Options

| option | |
| --- | --- |
| `[dir]` | where to write the project: a directory that is empty or does not exist yet. Asked when not given |
| `--template <name>`, `-t` | `api` or `react-router`. Asked when not given |
| `--no-install` | write the files, skip `bun install` |
| `--help`, `-h` | the usage |

Given both `dir` and `--template`, it asks nothing, so it runs in a script
or CI.

## Versions

- **alxia's packages** — `@alxia/core`, `@alxia/client`,
  `@alxia/react-router` — are moved to the newest version on the registry
  within the ranges this release of `@alxia/create` was published with:
  `^0.3.1` writes `^0.3.4` once 0.3.4 is out, never `^0.4.0`. Just after a
  release, while the registry does not serve that version yet, the newest of
  the same minor is written (`^0.3.0`, which takes 0.3.1 once it arrives),
  and the output says so. `bunx @alxia/create@<version>` picks an older set.
- **Everything else** — Zod, TypeScript, Vite, React, React Router, Tailwind
  — is moved to the newest version on the registry when the project is
  written, within the range alxia's packages accept: TypeScript within
  `^6.0.3 || ^7.0.0`, Vite within `^7.0.0 || ^8.0.0`, React Router and its
  packages within `^8.0.0`, Zod within `^4.2.0`; what no alxia package
  constrains goes to npm's `latest`. A newer major outside alxia's range is
  left out, and the output says so. The registry is the one
  `BUN_CONFIG_REGISTRY` or `npm_config_registry` names, else npmjs.org;
  when it does not answer, the template's own versions stay, with a warning.

## Other package managers

```sh
bunx @alxia/create my-app --template api
npm create @alxia my-app -- --template api
```

The bin runs on Bun (`#!/usr/bin/env bun`) whichever runner starts it, and
the project it writes installs with `bun install`.

## API

| export | |
| --- | --- |
| `create-alxia` | the bin `bun create @alxia`, `bunx @alxia/create` and `npm create @alxia` run. The package exports no module |

## Documentation

- [Guide](https://github.com/softistx/alxia/blob/develop/packages/create/docs/guide.md): each template file by file, what the `react-router` template adds to React Router's, each `Dockerfile`, how versions are chosen, and running it in CI.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/create/docs/troubleshooting.md): each message the command prints, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/create/docs/roadmap.md): what is coming, and what is not planned.
