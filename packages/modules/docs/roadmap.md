# Roadmap

What `@alxia/modules` gives an app, and what is coming. This page is a
direction, not a commitment.

## Now

- **The first release.** Module manifests, an ordered and checked registry,
  readers for the host, collection access typed per module, and a boundary
  test.
- **Access.** `@alxia/access` builds its role catalogue from the permissions
  and default grants modules declare.
- **Events.** `@alxia/events` checks `emits` and subscribers against the
  registry at boot.
- **Tenancy.** `@alxia/tenancy`'s `forModule` hands a module its
  `ModuleMongo` and `ModuleCoreMongo` handles from a request's scope, split
  between the tenant and the core database.

## Later

Nothing scheduled yet.

## Not planned

- **A database driver, a GraphQL server or a job queue.** The host brings
  them; the package only reads what modules declare.
- **A runtime dependency.** Its only peer is `typescript`.

## Shipped

Nothing published yet.
