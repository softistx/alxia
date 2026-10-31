# Roadmap

What `@alxia/tenancy` gives an app, and what is coming. This page is a
direction, not a commitment.

## Now

- **The first release.** The `TenantStore` contract, the `perOrganization`
  store (a core database and one database per organisation, a configurable
  header, membership, provisioning, a loop over every tenant, sync and
  migrations) and the `single` store (one database, one fixed tenant).

## Next

These integrations are with packages that are planned and not published yet.

- **Modules.** `@alxia/modules` passing the scope to a module's services and
  jobs, and splitting its collections between the core and the tenant
  databases.
- **Access.** `@alxia/access` reading the membership a scope carries as the
  viewer's role.
- **Events.** `@alxia/events` visiting the outbox of each tenant through
  `eachTenant`, one fixed tenant on the `single` store.
- **A shared contract suite.** The contract the package runs against both
  stores, published for a host's own store or registry to run.

## Later

Nothing scheduled yet.

## Not planned

- **Several tenants in one database.** A `schoolId`-style field on every
  document is a different isolation model; a query with a bug could cross it.
  The two stores keep a tenant's data in a database of its own, or alone.
- **A tenant resolved from a host name or a path.** The tenant comes from a
  header; the host's edge can set it.
- **Other databases than MongoDB.** The stores are written on `@nxgt/mongo`.

## Shipped

Nothing published yet.
