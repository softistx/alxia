# Roadmap

What `@alxia/create` gives a new app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/create/CHANGELOG.md).

## Now

Nothing scheduled yet.

## Next

Nothing scheduled yet.

## Later

- **A Dockerfile on Bun for the `react-router` template.** React Router's
  template ships one based on Node, which no longer runs the app once
  `start` runs Bun; the
  [`@alxia/react-router` guide](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md#deploying)
  says what to change. The template keeps React Router's files as its
  scaffold wrote them, so this waits for a decision to edit more of them.

## Not planned

- **Running `create-react-router` at creation.** The template is its
  output, committed and copied: a new project needs nothing but the
  registry, and no change upstream can stop the command. It is generated
  again from the scaffold when React Router ships a new major.
- **A runtime dependency.** The prompts are Bun's `prompt()`, the registry
  is read with `fetch`, versions are compared with `Bun.semver`.

## Shipped

### Next release

- **The `react-router` template is files, copied.** React Router's official
  template ships inside `@alxia/create`, with alxia's layer, and is copied
  as it is: no `create-react-router` runs, and no change in it can make the
  command refuse.
- **alxia's packages resolve at creation too.** `@alxia/core`,
  `@alxia/client` and `@alxia/react-router` move to the newest version
  within the ranges `@alxia/create` was published with. Right after a
  release, while the registry does not serve that version yet, the newest
  of the same minor is written, so `bun install` no longer fails with
  `No version matching "^0.3.1"`.

### 0.1.0

- `bun create @alxia [dir] [--template api|react-router] [--no-install]`,
  asking for what is not given; the `api` and `react-router` templates;
  dependencies at the newest versions alxia's peer ranges accept.
