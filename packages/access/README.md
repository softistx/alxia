# @alxia/access

Permissions, roles and guards for an application: a role catalogue built from
the permissions and default grants the modules declare, boot errors for an
unknown or duplicate permission, request guards over a tenant scope, and a
hook that maps refusals to the host's error codes. The only peer is
`@alxia/modules`; no database, no GraphQL server. The scope the guards read
comes from `@alxia/tenancy` (`lazyScope`), which this package does not
require: any `{ member }` scope works.

```sh
bun add @alxia/access
bun add @alxia/modules
bun add -d typescript
```

## In 30 seconds

Modules declare what they guard (`<area>:read` or `<area>:manage`) and which
of the host's roles hold it by default. The host supplies its roles.

```ts
import { defineModule } from '@alxia/modules';

export const notes = defineModule({
	name: 'notes',
	permissions: ['notes:read', 'notes:manage'],
	defaultGrants: { editor: ['notes:read', 'notes:manage'], member: ['notes:read'] },
});
```

```ts
import { createAccess } from '@alxia/access';

export const access = createAccess([notes], {
	roles: ['owner', 'editor', 'member'],
	all: 'owner', // holds every permission
}); // throws an AccessCatalogueError at boot when the grants are wrong

access.roleCan('member', 'notes:manage'); // false
access.permissionsOf('editor'); // ['notes:read', 'notes:manage']
```

## Guards

Each reads the request's viewer, the catalogue and the lazy scope of
`@alxia/tenancy`, and throws an `AccessError` (or lets the scope's own
refusal through):

```ts
import { requirePermission, requireSelf } from '@alxia/access';

// viewer: { id: string } | null, the signed-in account (the `Viewer` type)
const ctx = { viewer, access, scope: lazyScope(store, request, viewer) };

const scope = await requirePermission(ctx, 'notes:manage'); // 401, 400, 404, 403
await requireSelf(ctx, userId); // the viewer is that account, else 403
```

| Guard | Lets in |
| --- | --- |
| `requireViewer(ctx)` | any signed-in viewer (401 otherwise) |
| `requireMember(ctx)` | any member of the tenant, whatever the role |
| `requirePermission(ctx, p)` | a member whose role holds `p` |
| `requireAnyPermission(ctx, [p, q])` | a member whose role holds one of them |
| `requireSelf(ctx, userId, { or })` | the account itself, or a holder of `or` |
| `can(ctx, p)` | never throws for a missing viewer: `false`, for a flag or a field |

Every `p` is a `Permission` (`<area>:read` or `<area>:manage`), not a `string`: a plain `string` variable needs an `isPermission` check, or an `as const` list.

A module's two guards: `permissionsReadWrite('notes:read', 'notes:manage')`
returns `{ reading, writing }`, `membersReadPermissionWrites('notes:manage')` lets any member read, and `scopeOf({ read, write }, select)` builds
the same pair from guards of your own.

The codes (`auth.errors.unauthenticated`, `auth.errors.forbidden`, and the
`tenancy.errors.*` ones passed through) are fixed strings for the host to translate.

## Refusals to the host's error codes

```ts
import { refusalMapper, withRefusals } from '@alxia/access';

// HostError is the host's own error class
const mapped = refusalMapper((refusal) => new HostError(refusal.code, refusal.status, refusal.params));
const resolve = withRefusals((r) => new HostError(r.code, r.status, r.params), async () => 'ok');
```

`refusalOf(error)` recognises an `AccessError` and any error with an
`auth.errors.*` or `tenancy.errors.*` code and a numeric `status`, so
`@alxia/tenancy`'s refusals map the same way.

See [the docs](docs/README.md): the [guide](docs/guide.md), the
[troubleshooting](docs/troubleshooting.md) page for the boot errors, and the
[roadmap](docs/roadmap.md).

## License

MIT
