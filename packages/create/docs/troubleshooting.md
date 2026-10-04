# Troubleshooting

Each entry is headed by the text you see: what `create-alxia` printed, what
Bun or the shell printed before it ran, or — for a trap that prints
nothing — the symptom.

**Before it runs**

- [`error: GET https://registry.npmjs.org/@alxia%2fcreate - 404`](#error-get-httpsregistrynpmjsorgalxia2fcreate---404)
- [`env: bun: No such file or directory`](#env-bun-no-such-file-or-directory)

**The command line**

- [`create-alxia: unknown template vue: use api or react-router.`](#create-alxia-unknown-template-vue-use-api-or-react-router)
- [`create-alxia: --template needs a template: api or react-router.`](#create-alxia---template-needs-a-template-api-or-react-router)
- [`create-alxia: unknown option --yes.`](#create-alxia-unknown-option---yes)
- [`create-alxia: one directory only, given a and b.`](#create-alxia-one-directory-only-given-a-and-b)
- [`create-alxia: no directory given, and no terminal to ask in.`](#create-alxia-no-directory-given-and-no-terminal-to-ask-in)
- [`create-alxia: no --template given, and no terminal to ask in.`](#create-alxia-no---template-given-and-no-terminal-to-ask-in)
- [`create-alxia: cancelled, nothing written.`](#create-alxia-cancelled-nothing-written)

**The directory**

- [`create-alxia: my-app is not empty (…), and create-alxia writes only into an empty directory.`](#create-alxia-my-app-is-not-empty--and-create-alxia-writes-only-into-an-empty-directory)
- [`create-alxia: my-app exists and is not a directory.`](#create-alxia-my-app-exists-and-is-not-a-directory)

**Writing the project**

- [`create-alxia: failed: …`](#create-alxia-failed-)
- [`create-alxia: warning: the registry did not answer for …; kept the versions the template ships.`](#create-alxia-warning-the-registry-did-not-answer-for--kept-the-versions-the-template-ships)
- [`typescript: kept to ^6.0.3 || ^7.0.0, where the newest is 7.0.2; npm's latest, 8.0.0, is outside it`](#typescript-kept-to-603--700-where-the-newest-is-702-npms-latest-800-is-outside-it)
- [`zod: no release within ^4.2.0; kept ^4.2.0`](#zod-no-release-within-420-kept-420)
- [`@alxia/core: the registry has no release within ^0.3.1 yet; wrote ^0.3.0, the newest of ~0.3.0`](#alxiacore-the-registry-has-no-release-within-031-yet-wrote-030-the-newest-of-030)
- [`create-alxia: bun install failed; the files are written.`](#create-alxia-bun-install-failed-the-files-are-written)

**After**

- [`error: lockfile had changes, but lockfile is frozen`](#error-lockfile-had-changes-but-lockfile-is-frozen)
- [`error: Module not found "dist/server.js"`](#error-module-not-found-distserverjs)
- [`error: Cannot find package '…' from '/app/dist/server.js'`](#error-cannot-find-package--from-appdistserverjs)
- [The project's `@alxia/*` are older than npm's latest](#the-projects-alxia-are-older-than-npms-latest)

## Before it runs

### `error: GET https://registry.npmjs.org/@alxia%2fcreate - 404`

**When:** `bun create @alxia` (or `bunx @alxia/create`) is run against a
registry that has no `@alxia/create`: a mirror or a company registry that
does not proxy npm's. The URL is that registry's, not npmjs.org's.

**Why:** `bun create @alxia` installs `@alxia/create` from the registry Bun
is configured with, then runs its bin.

**Fix:** let the registry proxy npmjs.org, or point Bun at it for this one
command:

```sh
BUN_CONFIG_REGISTRY=https://registry.npmjs.org bun create @alxia my-app
```

### `env: bun: No such file or directory`

**When:** `npm create @alxia` on a machine without Bun. On Linux it reads
`/usr/bin/env: 'bun': No such file or directory`.

**Why:** the bin starts with `#!/usr/bin/env bun`: it runs on Bun, and the
projects it writes do too.

**Fix:** install Bun 1.4.2 or later (`curl -fsSL https://bun.sh/install | bash`),
then run `bun create @alxia`.

## The command line

### `create-alxia: unknown template vue: use api or react-router.`

**When:** `--template` names a template the command does not have, or the
prompt was answered with one.

**Fix:** `--template api` or `--template react-router`. `bun create @alxia
--help` lists them.

### `create-alxia: --template needs a template: api or react-router.`

**When:** `--template` is the last argument, or `--template=` is empty.
The message names the option as typed: `-t needs a template` for `-t`,
`--template= needs a template` for the empty form.

**Fix:** name one: `bun create @alxia my-app --template api`.

### `create-alxia: unknown option --yes.`

**When:** an option the command does not take. It takes `--template`,
`--no-install` and `--help`; it never asks a question the command line
answered, so it needs no `--yes`.

**Fix:** drop it. With npm, options go after `--`, or npm reads them as
its own: `npm create @alxia my-app -- --template api`.

### `create-alxia: one directory only, given a and b.`

**When:** two arguments that are not options: often a template given
without `--template`, as in `bun create @alxia my-app api`.

**Fix:** `bun create @alxia my-app --template api`.

### `create-alxia: no directory given, and no terminal to ask in.`

**When:** no directory on the command line, and standard input is not a
terminal: a script, CI, a pipe.

**Why:** the command asks only where it can; it does not guess a directory.

**Fix:** give it: `bun create @alxia my-app --template api`.

### `create-alxia: no --template given, and no terminal to ask in.`

**When:** a directory but no `--template`, with no terminal.

**Fix:** add `--template api` or `--template react-router`.

### `create-alxia: cancelled, nothing written.`

**When:** a question was answered with the end of the input — Ctrl-D, or
a pipe that closed — before the project was written.

**Fix:** run the command again and answer, or give both on the command
line: `bun create @alxia my-app --template api`. An empty answer takes the
default in brackets.

## The directory

### `create-alxia: my-app is not empty (…), and create-alxia writes only into an empty directory.`

**When:** the directory exists and holds anything, a `.git` or a
`.DS_Store` included. The message names its first three entries.

**Why:** the templates write a `package.json`, a `README.md`, a
`.gitignore`: overwriting a project's own is never what was meant. Nothing
was written.

**Fix:** another directory, or empty this one. To keep a `.git`, create the
project beside it and move the files in.

### `create-alxia: my-app exists and is not a directory.`

**When:** a file has the name given.

**Fix:** another name.

## Writing the project

### `create-alxia: failed: …`

**When:** any other error while writing the project, with the error's own
message after `failed:` — most often the file system: `EACCES` writing
into a directory the user cannot write to, `ENOSPC` with the disk full.

**Fix:** what the message names, then run the command again: what was
written is removed — the target directory is emptied when it was there,
removed when it was not. A parent directory the command created for it, as
`a/b` for `a/b/my-site`, stays.

### `create-alxia: failed: the api template names @alxia/zod at workspace:, which this @alxia/create has no version for`

**When:** at once, before anything is written; the template and package
vary.

**Why:** a template names an `@alxia/*` package at `workspace:^`, which
the command replaces with the version it was published beside, and this
release has none for that package. It is a broken `@alxia/create`
release, not your setup.

**Fix:** run the previous release, `bunx @alxia/create@<version>`, and
report it on [GitHub](https://github.com/softistx/alxia/issues).

### `create-alxia: warning: the registry did not answer for …; kept the versions the template ships.`

**When:** a dependency's metadata did not arrive within five seconds, or
the registry answered with an error. The project is still written, with the
template's own version for each package named.

**Why:** the versions are resolved when the project is written
([Versions](guide.md#versions)); without an answer the command keeps what
the template declares rather than fail. For the `react-router` template
that is React Router's, whose TypeScript may be older than alxia accepts.

**Fix:** once the registry answers, run the command again in an empty
directory, or move the packages named within alxia's ranges by hand:
`bun add -d typescript@^7 vite@^8`. The message can name an `@alxia/*`
package too, on a mirror that does not hold alxia's: the range kept is the
one this `@alxia/create` was published with, which that mirror cannot
install either, so let it proxy npmjs.org. Behind a proxy, check `BUN_CONFIG_REGISTRY` or
`npm_config_registry`, which the command reads.

### `typescript: kept to ^6.0.3 || ^7.0.0, where the newest is 7.0.2; npm's latest, 8.0.0, is outside it`

**When:** a notice, not an error: a dependency has a newer major on npm
than the range alxia's packages accept. Vite, React Router and Zod print
the same line when it happens to them.

**Why:** a major alxia does not accept yet is untested with it: the
project gets the newest version inside the range.

**Fix:** nothing to do. The range widens in a release of alxia's packages
once the major is tested, and the next `@alxia/create` takes it.

### `zod: no release within ^4.2.0; kept ^4.2.0`

**When:** a notice: the registry answered for the package, but none of its
releases is in the range alxia's packages accept — a registry mirror that
holds only some versions, most often. The template's own version is kept.
An `@alxia/*` package prints it too when the registry holds none of the
range's minor, not even an older patch.

**Fix:** check what the registry holds (`bun pm view zod versions`), let
the mirror fetch the missing ones, or write a version within the range by
hand after the project is created.

### `@alxia/core: the registry has no release within ^0.3.1 yet; wrote ^0.3.0, the newest of ~0.3.0`

**When:** a notice, not an error, right after an alxia release: the
registry lists `@alxia/create`'s new version but not yet the
`@alxia/core` (or `@alxia/client`, `@alxia/react-router`) published beside
it. npm can take a few minutes to serve a version everywhere.

**Why:** a project written with `^0.3.1` would fail its `bun install` with
`No version matching "^0.3.1" found`. The command writes the newest release
of the same minor instead; `^0.3.0` still takes 0.3.1.

**Fix:** nothing to do. Once the registry serves the new version,
`bun update @alxia/core` moves the project to it.

### `create-alxia: bun install failed; the files are written.`

**When:** `bun install` exited non-zero in the new project; its output,
just above, says why. The command exits 1, and lists `bun install` among
the next steps.

**Fix:** what its output says, then `cd my-app && bun install`. The
project is complete; only `node_modules` is missing.

## After

### `error: lockfile had changes, but lockfile is frozen`

**When:** `docker build` in a project stops at
`RUN bun install --frozen-lockfile`.

**Why:** the project's `Dockerfile` installs exactly what `bun.lock`
records, and `package.json` now asks for something it does not: a
dependency added or changed by hand, without `bun install`, or a `bun.lock` left
behind in a clone where `package.json` moved on without it.

**Fix:** run `bun install`, commit `bun.lock`, and build again. The other
traps of the `react-router` image, a write refused to the `bun` user among them, are in
[`@alxia/react-router`'s troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#eacces-permission-denied-open-app).

### `error: Module not found "dist/server.js"`

**When:** `bun start` in an `api` project that was never built, or whose
`dist/` was deleted.

**Why:** `start` runs the build, `bun dist/server.js`, as the image does;
it no longer runs `src/server.ts`. `bun dev` runs the sources.

**Fix:** build first:

```sh
bun run build && bun start
```

### `error: Cannot find package '…' from '/app/dist/server.js'`

The container stops at startup; in the `react-router` image the path is
`/app/build/server/index.js`. For a package loaded with `require`, Bun
writes `Cannot find module '…'`. Or the server starts and a request fails
with `ENOENT: no such file or directory`.

**When:** the image holds the build alone, `dist/` or `build/`, as the
`Dockerfile` copies it, and a dependency is not inside the bundle: one
the build was told to leave external, or one that cannot be bundled, a
native addon (a `.node` file) or a package that reads files of its own
folder at runtime.

The image runs `bun --no-install`, Bun's flag, not create-alxia's
option of the same name: without the flag, Bun finds no
`node_modules` and fetches the missing package from npm at startup, at
whatever version npm has, instead of failing.

**Why:** the image has no `node_modules`. `bun run build` bundles every
dependency into one file, and only what it leaves out must be installed
beside it.

**Fix:** mark the package external, and give the image the production
dependencies. In `api`, in the `build` script:

```json
"build": "bun build src/server.ts --target=bun --outdir=dist --minify --sourcemap=linked --external sharp"
```

In `react-router`, in `vite.config.ts`:

```ts
export default defineConfig({
	ssr: { external: ['sharp'] },
	plugins: [tailwindcss(), reactRouter(), alxia()],
});
```

Then in the `Dockerfile`, a stage for the production dependencies, copied
beside the build:

```dockerfile
# Before the build stage.
FROM oven/bun:1 AS production-dependencies
WORKDIR /app
COPY package.json bun.lock* bunfig.toml* ./
RUN bun install --frozen-lockfile --production

# In the final stage, before USER bun.
COPY --from=production-dependencies /app/node_modules ./node_modules
```

`grep '^import' dist/server.js` (or `build/server/index.js`) lists what
the bundle still imports: Node's and Bun's modules, and the packages left
external.

### The project's `@alxia/*` are older than npm's latest

**Symptom:** a fresh project declares `@alxia/core` at `^0.3.4` while npm
has `0.4.0`, and the output said `@alxia/core: kept to ^0.3.1, where the
newest is 0.3.4; npm's latest, 0.4.0, is outside it`.

**Why:** alxia's packages move only within the ranges the `@alxia/create`
that ran was published with ([Versions](guide.md#versions)): a new minor
is outside them, and a release of `@alxia/core` alone does not release a
new `@alxia/create`.

**Fix:** `bunx @alxia/create@latest` for the newest `@alxia/create`, and in
an existing project
`bun add @alxia/core@latest @alxia/client@latest` (`api`) or
`bun add @alxia/core@latest @alxia/react-router@latest` (`react-router`), reading
[`@alxia/core`'s upgrading page](https://github.com/softistx/alxia/blob/develop/packages/core/docs/upgrading.md)
for what a minor changed.
