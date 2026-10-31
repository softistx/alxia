# Troubleshooting

- [`declares "x", which is not <area>:read or <area>:manage`](#declares-x-which-is-not-arearead-or-areamanage)
- [`permission "x" is declared by two modules`](#permission-x-is-declared-by-two-modules)
- [`grants to "r", which is not one of the host's roles`](#grants-to-r-which-is-not-one-of-the-hosts-roles)
- [`grants "x", which it does not declare`](#grants-x-which-it-does-not-declare)
- [`the role "r" that holds every permission is not one of the roles`](#the-role-r-that-holds-every-permission-is-not-one-of-the-roles)
- [A guard answers 401](#a-guard-answers-401)
- [A guard answers 403 for a role that should hold the permission](#a-guard-answers-403-for-a-role-that-should-hold-the-permission)
- [A guard answers 404 or 400 instead of 403](#a-guard-answers-404-or-400-instead-of-403)

All the boot errors are `AccessCatalogueError`s thrown by `createAccess`; the
message names the module.

## `declares "x", which is not <area>:read or <area>:manage`

A permission has the shape `<area>:read` or `<area>:manage`: lower case,
digits and `_` in the area. `sales:write`, `Sales:read` and `sales` are
refused. Rename it:

```ts
import { defineModule } from '@alxia/modules';

export const sales = defineModule({ name: 'sales', permissions: ['sales:manage'] });
```

## `permission "x" is declared by two modules`

The message ends with the two modules, `("a" and "b")`. One permission has
one owner. Rename the area in one of them (`orders:read`). A module that only needs the other's permission guards
with it and does not declare it.

## `grants to "r", which is not one of the host's roles`

A module's `defaultGrants` names a role absent from `roles` given to
`createAccess`. Add the role to the host's list, or fix the spelling. A
module meant for several applications maps its generic tiers to the host's
role names in its factory.

## `grants "x", which it does not declare`

A module grants a permission that is not in its own `permissions`: an unknown
one (a typo), or another module's. Declare it in the module that grants it,
or move the grant to the module that owns the permission.

## `the role "r" that holds every permission is not one of the roles`

`all` names a role missing from `roles`. Add it or drop `all`.

## A guard answers 403 for a role that should hold the permission

The matrix only holds what a module grants. Check `access.permissionsOf(role)`.
Without `all`, no role holds everything. With a record membership or a
`single` store, the role comes from `roleOf`; without it the scope's `member`
must be the role name itself, and `undefined` holds nothing. A role
`roleOf` returns that is not in `roles` holds nothing either.

## A guard answers 404 or 400 instead of 403

The scope refuses first: 400 when the request names no tenant (the header
`@alxia/tenancy` reads), 404 when the tenant is unknown or the viewer is no
member. Both are the tenancy layer's refusals, passed through.

## A guard answers 401

`auth.errors.unauthenticated`: the context's `viewer` is `null`. Put the
signed-in account in the context before the guard runs. `can` answers
`false` instead of throwing.

## `Argument of type 'string' is not assignable to parameter of type 'Permission'`

The guards take a `Permission` (`<area>:read` or `<area>:manage`), not any
`string`. Check the variable with `isPermission(name)` before the call, or
declare the list `as const` so its members keep their literal types.
