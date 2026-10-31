# Roadmap

What `@alxia/modules` gives an app, and what is coming. This page is a
direction, not a commitment.

## Now

- **The first release.** Module manifests, an ordered and checked registry,
  readers for the host, collection access typed per module, and a boundary
  test.

## Next

- **Tenancy.** Integration with `@alxia/tenancy`: the scope a module's
  services and jobs receive, and collections split between shared and
  per-tenant databases.
- **Access.** Integration with `@alxia/access`: permissions and default
  grants feeding the access catalogue directly.
- **Events.** Integration with `@alxia/events`: `emits` and `subscribers`
  typed by the event catalogue.

## Later

Nothing scheduled yet.

## Not planned

- **A database driver, a GraphQL server or a job queue.** The host brings
  them; the package only reads what modules declare.
- **A runtime dependency.** Its only peer is `typescript`.

## Shipped

Nothing published yet.
