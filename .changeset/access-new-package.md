---
"@alxia/access": minor
---

New package: the `<area>:read|manage` permission, `createAccess` building the role catalogue from the module registry (the host supplies its roles, the modules' `defaultGrants` are merged, an unknown, badly spelled or duplicate permission and a grant to an unknown role are boot errors), the guards `requirePermission`, `requireAnyPermission`, `requireMember`, `requireViewer`, `requireSelf` and `can` over a tenant scope, `permissionsReadWrite`, `membersReadPermissionWrites` and `scopeOf` for a module's two guards, and `refusalMapper` and `withRefusals` to map refusals to the host's error codes.
