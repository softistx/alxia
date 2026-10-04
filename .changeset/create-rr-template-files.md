---
"@alxia/create": patch
---

The `react-router` template is now plain files that the command copies: React Router's official template, as `create-react-router` wrote it, shipped in the package with alxia's layer. `create-react-router` no longer runs, and the "is not what this @alxia/create expects" refusals are gone. alxia's own packages now resolve at creation like every other dependency, to the newest within the ranges this release was published with. Right after a release, when the registry does not serve that exact version yet, the newest release of the same minor is written instead, so `bun install` no longer fails with `No version matching "^0.3.1"`.
