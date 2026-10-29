# Roadmap

What `@alxia/records` gives an app, and what is coming. This page is a
direction, not a commitment.

## Now

Nothing in progress.

## Next

- **The claim rule.** Writing a referrer and purging its target can both
  commit when each sees the other's absence; an optional claim on the target's
  document, checked by the referrer's write, closes it. It depends on
  database hooks, so it needs its own ports.

## Later

Nothing scheduled yet.

## Not planned

- **A database driver or an audit log.** They are ports: the package imports
  neither.
- **A runtime dependency.** Its only peer is `typescript`.

## Shipped

Nothing published yet.
