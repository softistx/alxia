# Troubleshooting

- [`tenancy.errors.organization-required`](#tenancyerrorsorganization-required)
- [`tenancy.errors.unknown-organization`](#tenancyerrorsunknown-organization)
- [`tenancy.errors.slug-taken`](#tenancyerrorsslug-taken)
- [`not an organization id`](#not-an-organization-id)
- [`all N database slots are taken`](#all-n-database-slots-are-taken)
- [`the tenant cache holds at least one entry`](#the-tenant-cache-holds-at-least-one-entry)
- [`rollback: "x" is in no migration list`](#rollback-x-is-in-no-migration-list)
- [`migration failed in <database>`](#migration-failed-in-database)
- [An organisation stays `provisioning`](#an-organisation-stays-provisioning)
- [A request with a valid header is a 404](#a-request-with-a-valid-header-is-a-404)

## `tenancy.errors.organization-required`

A `TenancyError`, status 400, `params.header` the header name. The request
named no organisation. Send the header the store reads (`x-organization-id`, or
the `header` option), or, for a route that needs no organisation, do not ask
for the scope.

## `tenancy.errors.unknown-organization`

A `TenancyError`, status 404. The same answer on purpose for: no organisation
under that id or slug, an organisation that is `provisioning`, `archived` or
soft-deleted, a viewer who is not a member, and an anonymous request. To tell
them apart while debugging, call `tenancy.resolve(ref)` (the organisation, or
`undefined`) and your `membership` function directly.

## `tenancy.errors.slug-taken`

A `TenancyError`, status 409, from `provision`. Another organisation has the
slug. The registry's `create` may reject with `@nxgt/mongo`'s `ConflictError`,
which `provision` turns into this; give `organizations.slug` a unique index.

## `not an organization id`

A `TypeError` from `databaseOf`, `databases.open` or `nameOf`: the value is
not 24 lowercase hex digits. Only an id from the registry reaches a database
name; resolve a slug or a header value with `resolve(ref)` first.

## `all N database slots are taken`

A `RangeError` from `slotNaming`: the suite touched more organisations than
slots. Call `naming.reset()` (or `release(id)`) between tests, or raise the
number of slots.

## `the tenant cache holds at least one entry`

A `RangeError`: `size` must be an integer of 1 or more.

## `rollback: "x" is in no migration list`

An `UnknownMigrationError`: neither the core list nor the tenant list holds
that id, so nothing was reverted. Check the id with
`tenancy.migrate({ kind: 'status' })`.

## `migration failed in <database>`

The `cause` is the migration's error. The loop stopped at that database, so the
ones after it were not touched. Fix the migration, then run it again; the
databases already done skip it.

## An organisation stays `provisioning`

`provision` registers the organisation first, so a failing database step (no
`dbAdmin` role, a migration that throws) leaves it `provisioning` and throws.
It resolves from no request until it is `active`. Fix the cause, then call
`tenancy.prepare(id)` and activate it through your registry; `sync()` and
`migrate()` also visit it.

## A request with a valid header is a 404

Check, in order: the organisation is `active`; the header is the one the store
reads (`store.header`); `membership` returns something other than `null` or
`false` for this account; and the registry's `findById` / `findBySlug` do not
hide it (soft delete).
