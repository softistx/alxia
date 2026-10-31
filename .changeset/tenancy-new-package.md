---
"@alxia/tenancy": minor
---

New package: the `TenantStore` contract and two stores. `perOrganization` keeps the host's core database and one database per organisation, with the tenant named by a configurable header (id or slug), a membership port, `eachTenant({ withDeleted })`, `provision`, and `sync` and `migrate` over every database; `single` keeps one database and one fixed tenant behind the same contract. `forModule` hands a module its typed `ModuleMongo` handles from a scope, and `modules` feeds the migrations from the registry. `slotNaming` bounds the databases a test suite creates, and `lazyScope` and `viewerMemberships` keep a request's scope and memberships read once.
