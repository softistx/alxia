---
"@alxia/events": patch
"@alxia/tenancy": patch
---

Accept `@nxgt/mongo` 0.25 (`^0.25.0` peer range); `@alxia/tenancy` casts the wiring handles through `unknown`, and `@alxia/events` takes a `TenantStore<unknown, any, Tenant, unknown>`, since `Mongo<C>` is no longer assignable across type arguments.
