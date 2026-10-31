# Roadmap

What `@alxia/tenancy` gives an app, and what is coming. This page is a
direction, not a commitment.

## Now

- **The first release.** The `TenantStore` contract, the `perOrganization`
  store (a core database and one database per organisation, a configurable
  header, membership, provisioning, a loop over every tenant, sync and
  migrations) and the `single` store (one database, one fixed tenant).

- **Module handles.** `forModule` hands a module its `ModuleMongo` handles
  from a scope: its collections on the tenant's database, its core ones on the
  core database, typed to what it owns or depends on. Provisioning, `sync`
  and `migrate` read the registry.

- **Access.** `@alxia/access` reads the membership a scope carries as the
  viewer's role.
- **Events.** `@alxia/events` visits the outbox of each tenant through
  `eachTenant`, one fixed tenant on the `single` store.

## Next

- **A shared contract suite.** The contract the package runs against both
  stores, published for a host's own store or registry to run.

## Later

Nothing scheduled yet.

## Not planned

- **Several tenants in one database.** A `tenantId`-style field on every
  document is a different isolation model; a query with a bug could cross it.
  The two stores keep a tenant's data in a database of its own, or alone.
- **A tenant resolved from a host name or a path.** The tenant comes from a
  header; the host's edge can set it.
- **Other databases than MongoDB.** The stores are written on `@nxgt/mongo`.

## Shipped

Nothing published yet.
