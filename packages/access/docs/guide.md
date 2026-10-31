# Guide

## Permissions

A permission is `<area>:read` or `<area>:manage`: the area in lower case,
digits and `_`, then `read` (see) or `manage` (change). The `Permission` type
is that shape, and `isPermission(value)` checks a string. A module declares
the ones it guards in `permissions` and says which roles hold them by default
in `defaultGrants`:

```ts
import { defineModule } from '@alxia/modules';

export const billing = defineModule({
	name: 'billing',
	permissions: ['billing:read', 'billing:manage'],
	defaultGrants: {
		accountant: ['billing:read', 'billing:manage'],
		member: ['billing:read'],
	},
});
```

A module grants only permissions it declares itself. A module that is meant
to be mounted in several applications names generic tiers in its factory and
maps them to the host's role names before calling `defineModule`.

## The catalogue

The host supplies its roles. `createAccess` merges every module's grants
into one matrix, frozen row by row:

```ts
import { createAccess } from '@alxia/access';
import { resolveModules } from '@alxia/modules';

const modules = resolveModules([billing]);

export const access = createAccess(modules, {
	roles: ['owner', 'accountant', 'member'],
	all: 'owner',
});

access.permissions; // ['billing:read', 'billing:manage'], in registry order
access.permissionsOf('member'); // ['billing:read']
access.roleCan('accountant', 'billing:manage'); // true
```

`all` names the role that holds every declared permission, whatever the
grants say. Leave it out when no role does. Call `createAccess` once, at
boot: it throws an `AccessCatalogueError` for a permission that is badly
spelled or declared twice, a grant to a role the host did not supply and a
grant of a permission the module does not declare. See
[troubleshooting](troubleshooting.md).

## Guarding an operation

A guard reads a context with the viewer, the catalogue and the request's
lazy scope (`lazyScope` from `@alxia/tenancy` resolves it once and keeps its
refusals):

```ts
import { requirePermission } from '@alxia/access';
import { lazyScope } from '@alxia/tenancy';

const ctx = { viewer, access, scope: lazyScope(store, request, viewer) };

export async function createInvoice() {
	const scope = await requirePermission(ctx, 'billing:manage');
	// scope.mongo is the tenant's database as the viewer
}
```

`ctx` is a `GuardContext<Scope>`; its `viewer` is a `Viewer`, `{ id: string }`
or `null`. A guard of your own throws the same refusals with
`unauthenticated()` and `forbidden(permission)`, the factories the built-in
guards use.

Refusals come in a fixed order: 401 `auth.errors.unauthenticated` without a
viewer (before the scope is read), then the scope's own (400
`tenancy.errors.organization-required`, 404
`tenancy.errors.unknown-organization`, the same for an unknown tenant and a
non-member so existence is never probed), then 403 `auth.errors.forbidden`
with `params.permission`.

The scope's `member` is the role by default (`Membership<Role>`). When the
membership answers a record, give `roleOf`:

```ts
import { createAccess } from '@alxia/access';

export const access = createAccess(modules, {
	roles: ['owner', 'member'],
	roleOf: (member: { role: 'owner' | 'member' }) => member.role,
});
```

### Own data: `requireSelf`

What belongs to one account is never opened by a grant:

```ts
import { requireSelf } from '@alxia/access';

await requireSelf(ctx, userId); // 403 unless the viewer is userId
await requireSelf(ctx, userId, { or: 'members:manage' }); // or a holder of that permission
```

### Flags and fields: `can`

`can(ctx, 'billing:manage')` answers a boolean for a field such as
`viewer.canManage`; no viewer is `false`.

### A module's two guards

```ts
import { permissionsReadWrite } from '@alxia/access';

export const { reading, writing } = permissionsReadWrite(
	'billing:read',
	'billing:manage',
	(scope) => ({ mongo: scope.mongo }),
);
```

The third argument selects what a service is built from. `scopeOf({ read,
write }, select)` does the same for guards of your own, and
`membersReadPermissionWrites('billing:manage')` lets any member read.

## Single-tenant hosts

On `@alxia/tenancy`'s `single` store the scope's `member` is `undefined`: no
membership is checked. Say which role the viewer has from the viewer
itself, since the store gives nothing else:

```ts
import { createAccess } from '@alxia/access';

export const access = createAccess(modules, {
	roles: ['owner', 'member'],
	all: 'owner',
	roleOf: (_member: undefined, viewer) => roleOfAccount(viewer.id),
});
```

`roleOf` may be async. Plugins and their guards run unchanged in both modes.

## Mapping refusals to the host's error codes

The guards throw `AccessError`; the tenancy layer throws `TenancyError`.
Both carry `code`, `status` and `params`. Map them once to the host's error
type:

```ts
import { type Refusal, refusalMapper, withRefusals } from '@alxia/access';

// HostError is the host's own error class
const toHost = (refusal: Refusal) =>
	new HostError(refusal.code, refusal.status, refusal.params);

// as the GraphQL server's error hook
export const mapError = refusalMapper(toHost);

// or around one resolver
export const guarded = withRefusals(toHost, async () => 'ok');
```

Anything that is not a refusal passes through untouched.
