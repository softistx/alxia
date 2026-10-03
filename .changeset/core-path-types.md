---
"@alxia/core": minor
---

A route path written as a literal that the app would refuse when the route is declared no longer compiles: `app.get('/at/10:30', …)` is `Argument of type '"/at/10:30"' is not assignable to parameter of type '"Invalid path: \"/at/10:30\": \":\" may only start a segment, as a parameter"'`, and its params are no longer inferred as `{ 30: string }`. The type reads the rules the `TypeError` enforces on one path — a `:` or `*` inside a segment, a `*` before the end, a parameter name that is not an identifier or is declared twice, a dot segment — on every method that declares a route (`get` and the others, `route`, `ws`, `page`, `file`, `static`), under the app's prefix and the group's. A path typed `string`, or holding a `` `${string}` ``, is left to the runtime check as before. New exports: `PathAt`, `CheckedPath` and `StaticPath`, the check itself.

**Breaking, for a function that forwards a path generic in `P`:** `app.get(path, …)` with `path: P` no longer compiles, since the path cannot be checked until `P` is known. Type the parameter with the check of the method it forwards to — `path: PathAt<'', P>`, or `PathAt<'', P, StaticPath<P>>` for `static` — and the path is checked where the function is called, the route keeping its literal path.
