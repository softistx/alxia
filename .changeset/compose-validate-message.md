---
"@alxia/core": patch
---

`use(validate(…))`, `use(responds(…))` and `use(compose(…))` holding one say why on the error's first line, on TypeScript 6 and 7 alike: `… is not assignable to parameter of type '"validate() belongs to a route, not to use(): give it among the route's middlewares"'` (`responds()` for a `responds`, both named for a `compose` holding both), where the message stood three lines down, under `Types of property ''~builtin'' are incompatible`. And `use(m1, …, m9)` is one error on the ninth, `"at most 8 middlewares per route: group them with compose(...)"`, as on a route, where it read `No overload matches this call`, the message under the first overload on TypeScript 6 and missing on TypeScript 7.
