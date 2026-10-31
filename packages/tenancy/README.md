# @alxia/tenancy

Tenancy for an application on [`@nxgt/mongo`](https://www.npmjs.com/package/@nxgt/mongo):
one contract, `TenantStore`, and two strategies behind it. `perOrganization`
keeps a core database (accounts, the organisation registry, cross-organisation
data) and one database per organisation; `single` keeps one database and one
fixed tenant. A request names its organisation in a header, and the scope it
gets is that organisation's database, so a resolver never builds a database
name and a query cannot reach another organisation's data.

```sh
bun add @alxia/tenancy @alxia/modules @nxgt/mongo mongodb
bun add -d typescript
```

## In 30 seconds

```ts
import { connectMongo, defineMongo, openMongo } from '@nxgt/mongo';
import { perOrganization } from '@alxia/tenancy';

const { client } = await connectMongo(process.env.MONGO_URI!);

// The host's core database: the registry of organisations, accounts...
const core = await openMongo(
	defineMongo({ client, database: 'app_core', collections: coreCollections }),
);

export const tenancy = perOrganization({
	core,
	registry, // the port over your `organizations` collection, see the guide
	database: 'app_org_', // databases are named `app_org_<id>`
	configure: (database) =>
		defineMongo({ client, database, collections: tenantCollections }),
	membership: async (organizationId, accountId) =>
		(await roleOf(organizationId, accountId)) ?? null, // null: not a member
});
```

## A request's scope

```ts
const scope = await tenancy.scope(request, viewer); // viewer: { id } or null

scope.tenant; // the organisation record
scope.mongo; // ITS database, writes stamped with the viewer
scope.core; // the host's core database
scope.member; // what `membership` answered, a role for instance
```

It throws a `TenancyError` with a `code`, a `status` and `params` to map to
your own errors: `tenancy.errors.organization-required` (400, header missing),
`tenancy.errors.unknown-organization` (404, for an unknown, not-active or
not-member organisation alike, so a caller learns nothing about which exist).

Resolve the scope once per request, only when something asks:

```ts
import { lazyScope } from '@alxia/tenancy';

const getScope = lazyScope(tenancy, request, viewer);
const { mongo } = await getScope(); // the same promise every time
```

## A module's handles

Give the store your registry and plugin code touches only the handles of its
module, typed through `Register`; it never names a database:

```ts
import { resolveModules } from '@alxia/modules';

const modules = resolveModules(registered);
const tenancy = perOrganization({ /* … */ modules });

const scope = await tenancy.scope(request, viewer);
const { mongo, core } = tenancy.forModule(scope, 'notes');
mongo.db.notes; // the module's tenant collections and its `dependsOn` ones
core.db.accounts; // its `coreCollections`, on the core database
```

`collections` land in the tenant's database, `coreCollections` in the core
one; on the `single` store both are the same database. `forModule` also takes
`{ mongo, core: tenancy.core }` for the tenant `eachTenant` hands you. It throws
a `ModuleWiringError` for a module the registry lacks, or a collection your
`defineMongo` wiring does not hold (wire it with `collectionsOf(modules)` and
`coreCollectionsOf(modules)`). Provision, `sync` and `migrate` take the
migrations from the registry (`migrationsOf`, `coreMigrationsOf`), before
those of `migrations` and `coreMigrations`.

## The header, id or slug

The header is `x-organization-id` by default and names the organisation by id
or by slug, in any case. Change it with `header`:

```ts
perOrganization({ /* … */ header: 'x-tenant-id' });
```

The default is exported as `DEFAULT_HEADER`. Only an `active` organisation resolves. Outside a request,
`tenancy.resolve(ref)` does the same lookup.

## Every tenant, for a job

```ts
await tenancy.eachTenant(async (tenant, mongo) => {
	await mongo.db.outbox.deleteMany({ sentAt: { $lt: cutoff } });
}); // the active organisations, one after the other

await tenancy.eachTenant(visit, { withDeleted: true }); // every registered one
```

## Provision, sync, migrate

```ts
const school = await tenancy.provision({ slug: 'north', name: 'North' }, actorId);
// registered as `provisioning`, database synced and migrated, then `active`

// throws a TenancyError `tenancy.errors.slug-taken` (409) when the slug is taken

await tenancy.sync(); // `db:sync`: the core, then every organisation
await tenancy.migrate({ kind: 'apply', dryRun: false }); // `db:migrate`
await tenancy.migrate({ kind: 'rollback', to: '2026-10-27-marker', dryRun: true });
```

## One database

For a host that serves one organisation, the same contract with no header and
no membership check:

```ts
import { single } from '@alxia/tenancy';

export const tenancy = single({
	mongo, // the one database
	tenant: { id: 'main', slug: 'main', name: 'Main' },
	migrations,
});
```

Code written against `TenantStore` runs on both stores unchanged.

## Test databases

`slotNaming` names databases `<prefix>_slot1`, `<prefix>_slot2`… so a suite
creates a bounded number of them, however many organisations it provisions:

```ts
import { slotNaming } from '@alxia/tenancy';

const database = slotNaming('app_test', 4);
perOrganization({ /* … */ database });
database.reset(); // between tests
```

## API

| Export | What it does |
| --- | --- |
| `perOrganization(options)` | the core database plus one database per organisation |
| `single(options)` | one database, one fixed tenant |
| `TenantStore` | the contract both answer: `resolve`, `tenantOf`, `databaseOf`, `scope`, `forModule`, `eachTenant`, `provision`, `prepare`, `sync`, `migrate`, `close` |
| `lazyScope(store, request, viewer)` | a request's scope, resolved once, on first use |
| `viewerMemberships(membership, viewer)` | the viewer's membership in any tenant, read once per request |
| `slotNaming(prefix, slots)` | `<prefix>_slot<n>` database names for tests |
| `createTenantDatabases(options)`, `isTenantId`, `dbOf` | the bounded cache of tenant `Mongo`s, the check on ids that reach a database name, the driver's `Db` under a `Mongo` |
| `ModuleScope`, `ModuleSource` | what `forModule` returns (`mongo`, `core`) and takes |
| `TenancyError`, `UnknownMigrationError`, `ModuleWiringError` | the refusals |
| `organizationRequired(header)`, `unknownOrganization()`, `slugTaken(slug)` | the `TenancyError`s the stores throw, for a host's own store or spec to throw the same ones |
| `DEFAULT_HEADER` | `'x-organization-id'`, the header when `header` is not given |
| `noMembers` | a `Membership` that admits nobody, for a spec or a locked-down host |
| `Tenant`, `TenantRegistry`, `Membership`, `TenantScope`, `Viewer`, `Resolution`, `MigrateMode`, `MigrationOutcome` | the types |

Peers: `@alxia/modules`, `@nxgt/mongo`, `mongodb`, `typescript`.

## Documentation

- [Guide](https://github.com/softistx/alxia/blob/develop/packages/tenancy/docs/guide.md): the registry port, a request's scope, jobs, provisioning, migrations, the single store, testing.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/tenancy/docs/troubleshooting.md): an error message, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/tenancy/docs/roadmap.md): what is coming, and what is not planned.
