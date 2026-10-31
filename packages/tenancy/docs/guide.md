# Guide

## The contract

Both stores answer `TenantStore<C, K, T, M>`: `C` is the wiring of a tenant
database, `K` the wiring of the core database, `T` your tenant record and `M`
what a membership is (a role, `true`...). Code written against it, such as a
plugin, runs on either store and never names a database.

| Member | What it does |
| --- | --- |
| `core` | the host's core database handle, no actor |
| `resolve(ref)` | the active tenant a ref (id or slug, any case) names |
| `tenantOf(request)` | `found`, `none` or `unknown`, from the request's header |
| `databaseOf(tenant)` | the tenant's database, no actor |
| `scope(request, viewer)` | `{ tenant, mongo, core, member }`, or a `TenancyError` |
| `forModule(source, name)` | a module's `{ mongo, core }` handles, typed to its collections and its `dependsOn` ones; `source` is a scope, or `{ mongo, core: store.core }` for a tenant `eachTenant` visits |
| `modules` | the registry the store was given |
| `eachTenant(fn, { withDeleted })` | `fn(tenant, mongo)` on each tenant in turn |
| `provision(input, actor)` | registers, prepares the database, activates |
| `prepare(id)` | sync, then migrations, on one tenant's database |
| `sync()` | sync the core, then every tenant; the database names |
| `migrate(mode)` | apply, status or rollback on the core, then every tenant |
| `close()` | forgets what the store cached |

## Module handles

`@alxia/modules` is a required peer. Pass the registry as `modules` (optional; without it `forModule` throws `module "x" is not registered`, and the store runs only the explicit migrations) to `perOrganization` or `single`) and the store
reads the migrations from it: `migrationsOf` for each tenant database,
`coreMigrationsOf` for the core one, in dependency order, before the explicit
`migrations` and `coreMigrations`. Indexes come from the collections your
`defineMongo` wiring holds, so wire them from the registry:

```ts
import { collectionsOf, coreCollectionsOf } from '@alxia/modules';

const core = await openMongo(
	defineMongo({ client, database: 'app_core', collections: coreCollectionsOf(modules) }),
);
const tenancy = perOrganization({
	core,
	modules,
	configure: (database) =>
		defineMongo({ client, database, collections: collectionsOf(modules) }),
	// …
});
```

A request, a job or a subscriber then asks for its module:

```ts
const scope = await tenancy.scope(request, viewer);
const { mongo, core } = tenancy.forModule(scope, 'notes');

await tenancy.eachTenant(async (_tenant, mongo) => {
	const { mongo: notes } = tenancy.forModule({ mongo, core: tenancy.core }, 'notes');
	// …
});
```

With `Register` merged (see `@alxia/modules`), `mongo.db` holds the module's
`collections` and those of its `dependsOn`, `core.db` its `coreCollections`
and theirs; anything else is a compile error. The narrowing is in the types:
at run time `forModule` checks that the module is registered and that every
collection it may reach is wired in the database it belongs to, then returns
the same handles. On a `single` store `mongo` and `core` are the same
database, so wire both lists into it. A collection name cannot be both a tenant
and a core collection.

## Wiring `perOrganization`

One `MongoClient` serves the process. The core `Mongo` and every tenant's are
opened on it with `client`, which they never close.

```ts
import { connectMongo, defineMongo, openMongo } from '@nxgt/mongo';
import { perOrganization } from '@alxia/tenancy';

const { client } = await connectMongo(process.env.MONGO_URI!);

const core = await openMongo(
	defineMongo({ client, database: 'app_core', collections: coreCollections }),
);

export const tenancy = perOrganization({
	core,
	registry,
	database: 'app_org_',
	size: 20, // open tenant databases kept, least recently used leaves first
	header: 'x-tenant-id', // default: 'x-organization-id'
	configure: (database) =>
		defineMongo({ client, database, collections: tenantCollections }),
	membership: async (organizationId, accountId) =>
		(await roleOf(organizationId, accountId)) ?? null,
	migrations: tenantMigrations, // run on every tenant database
	coreMigrations, // run on the core database
	syncCore: async (core) => {
		await syncAuthCollections(core); // anything else `db:sync` creates in the core
	},
});
```

`size` is the number of open tenant `Mongo`s kept (default 10, least recently used leaves first). `sync()` and `migrate()` open every registered tenant in turn, so with many more tenants than `size` they churn the cache: that is harmless (the client is shared) but each open is rebuilt; raise `size` if it matters.

A tenant database is named `<prefix><id>`, where the id is the 24 hex digits of
the registry's `ObjectId`. Nothing else ever reaches a name: a header or a slug
is resolved through the registry first, so a name cannot be forged.

## The registry port

The registry of organisations lives in the host's core database and is the
host's collection. The package asks for five operations:

```ts
import { ObjectId } from 'mongodb';
import type { Tenant, TenantRegistry } from '@alxia/tenancy';

interface Organization extends Tenant {
	version: number; // optimistic lock, if the collection has one
}

const toTenant = (doc: OrganizationDocument): Organization => ({
	id: doc._id.toHexString(),
	slug: doc.slug,
	name: doc.name,
	status: doc.status, // 'provisioning' | 'active' | 'archived'
	version: doc.version,
});

export const registry: TenantRegistry<Organization> = {
	async findById(id) {
		const doc = await core.db.organizations.findById(new ObjectId(id));
		return doc ? toTenant(doc) : undefined;
	},
	async findBySlug(slug) {
		const doc = await core.db.organizations.findFirst({ slug });
		return doc ? toTenant(doc) : undefined;
	},
	async list({ withDeleted }) {
		return (await core.db.organizations.findMany({ withDeleted })).map(toTenant);
	},
	async create(input, actor) {
		// A unique index on `slug` makes a taken one a `ConflictError`.
		return toTenant(await core.db.organizations.as(actor).create({ ...input }));
	},
	async activate(tenant, actor) {
		return toTenant(
			await core.db.organizations
				.as(actor)
				.update(new ObjectId(tenant.id), { status: 'active', version: tenant.version }),
		);
	},
};
```

The record may hold more than `Tenant` asks for; the scope hands it back as is.
`create` registers the tenant `provisioning`: it is not resolved from a request
until `activate`.

## A request's scope

```ts
const scope = await tenancy.scope(request, viewer);
const notes = await scope.mongo.db.notes.findMany();
```

The checks, in order: the header is present (400), the organisation is active
(404), the viewer is a member (404, the same answer, so a caller learns nothing
about which organisations exist). `scope.mongo` writes with the viewer's id as
actor. The host's core database comes along as `scope.core`, for the data the
host keeps there; plugin code touches `scope.mongo` only.

`DEFAULT_HEADER` is the default header name. `noMembers` is a `Membership` that admits nobody, for a spec or a host that must refuse every scope. The stores throw their refusals with `organizationRequired(header)`, `unknownOrganization()` and `slugTaken(slug)`; a host's own store, registry or spec can throw the same `TenancyError`s.

To map the refusals to your errors:

```ts
import { TenancyError } from '@alxia/tenancy';

function toApiError(error: unknown) {
	if (error instanceof TenancyError) {
		return new ApiError(error.code, { status: error.status, params: error.params });
	}
	return error;
}
```

`lazyScope(tenancy, request, viewer)` returns a function that resolves the
scope on first use and keeps the answer, the refusal included, so every guard
of a request answers the same and a request that never asks never reads the
header, the registry or the membership.

When several organisations appear in one response, read each membership once:

```ts
import { viewerMemberships } from '@alxia/tenancy';

const memberships = viewerMemberships(roleOf, viewer);
const role = await memberships.in(organizationId); // null for a non-member
memberships.prime(organizationId, role ?? 'member'); // a membership already in hand
```

## Every tenant

```ts
const counts = await tenancy.eachTenant(async (tenant, mongo) => ({
	tenant: tenant.slug,
	notes: await mongo.db.notes.count(),
}));
```

By default only `active` tenants are visited. `{ withDeleted: true }` visits
every registered one, whatever its status, soft-deleted ones included: use it
for maintenance that must not skip a tenant, and keep the default for jobs.
Tenants are visited one after the other; an error stops the loop.

## Provisioning

```ts
const school = await tenancy.provision({ slug: 'north', name: 'North' }, actorId);
```

`provision` registers the tenant (`provisioning`), syncs its collections
(validators and indexes, only the ones `configure` wires, never the core's),
runs the tenant migrations, then activates it. It needs the `dbAdmin` role: it
is a deployment step, never a request. A taken slug is a `TenancyError`
`tenancy.errors.slug-taken`. If the database step fails the tenant stays
`provisioning`. The retry is the host's: fix the cause, call `tenancy.prepare(id)`, then `registry.activate(tenant, actor)`.

## Sync and migrations

```ts
const names = await tenancy.sync(); // core, then every registered tenant

const outcomes = await tenancy.migrate({ kind: 'apply', dryRun: true });
await tenancy.migrate({ kind: 'apply', dryRun: false });
await tenancy.migrate({ kind: 'status' });
await tenancy.migrate({ kind: 'rollback', to: '2026-10-27-marker', dryRun: false });
```

Both visit every registered tenant, whatever its status. `sync` only syncs and
`migrate` only migrates. The core list runs on the core database, the tenant
list on each tenant's; each outcome names its database and the ids applied,
reverted or (dry run) pending. A rollback touches only the list that holds its
id, and an id no list holds is refused before anything is reverted
(`UnknownMigrationError`). One failing database stops the loop with its name in
the error.

## One database

```ts
import { single } from '@alxia/tenancy';

export const tenancy = single({
	mongo, // the one database
	tenant: { id: 'main', slug: 'main', name: 'Main' },
	migrations,
	coreMigrations,
});
```

The scope always carries the fixed tenant and `member` is `undefined`: there is
no header and no membership check, and access is left to permissions. `core` is
the same handle as `mongo` unless you pass `core` for a database kept apart.
With no database apart, `coreMigrations` run on the one database before
`migrations`, so a module's core migrations are not lost. `eachTenant` visits
the one tenant; `provision` prepares the database and returns the tenant,
ignoring its input, and can run again; `databaseOf` of any other id is a
`tenancy.errors.unknown-organization`.

## Testing

Keep the number of databases bounded with slot names:

```ts
import { perOrganization, slotNaming } from '@alxia/tenancy';

const database = slotNaming('app_test', 4); // app_test_slot1 ... app_test_slot4
const tenancy = perOrganization({ /* … */ database });

afterEach(() => database.reset());
```

A tenant takes the lowest free slot; `release(id)` frees one. The ids that
reach a name are still checked.

An in-memory replica set (`mongodb-memory-server`) is enough to run a suite:
`@nxgt/mongo` transactions need one. To check isolation, create two tenants and
assert that what one writes through its `scope.mongo` is invisible from the
other; to check your own store or registry, run the same assertions against
`perOrganization` and `single` and compare, as this package does.
