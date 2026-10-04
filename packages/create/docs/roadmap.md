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
  says what to change. The template keeps React Router's files as they are
  written today, so this waits for a decision to edit more of them.

## Not planned

- **A copy of React Router's template.** The `react-router` template runs
  React Router's own `create-react-router` and edits what it writes, as
  `examples/react-router` was made: a frozen copy would drift from it.
- **A runtime dependency.** The prompts are Bun's `prompt()`, the registry
  is read with `fetch`, versions are compared with `Bun.semver`.

## Shipped

### 0.1.0

- `bun create @alxia [dir] [--template api|react-router] [--no-install]`,
  asking for what is not given; the `api` and `react-router` templates;
  dependencies at the newest versions alxia's peer ranges accept.
