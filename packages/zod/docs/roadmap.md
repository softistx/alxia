# Roadmap

What `@alxia/zod` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/zod/CHANGELOG.md).

## Now

- **`zodConverter` removed in 0.2.** Nothing in alxia read it: Zod's own
  `z.toJSONSchema(schema)` converts a schema.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **Zod inside `@alxia/core`.** It reads any Standard
  Schema and names no validator, so an app can use Zod, Valibot, ArkType or
  its own; what only Zod can do lives in this package.
- **A runtime dependency.** `@alxia/zod` declares no dependency, only
  peers: the app's own `zod` is the one used.

## Shipped

### 0.1.0

- **Coercions a client can type.** `zq.number()`, `zq.int()`,
  `zq.boolean()` and `zq.date()` read the text of the path, the query
  string, headers and cookies as a number, an integer, a boolean or a
  `Date`, while a typed client sends the value itself — `{ page: 2 }`, not
  `{ page: '2' }`, and never `unknown`.
- **Strict reading.** An empty value is not `0`, `'false'` is `false`,
  and a date and time without an offset is refused rather than guessed.
- **Refusals that say what was expected.** A refused value reports
  `Expected a number`, `Expected an integer`, `Expected true, false, 1 or 0`,
  `Expected an ISO 8601 date or date-time` or `Expected JSON`, and a
  refused list reports what was refused — the value given, or each refused
  item at its index — never Zod's bare `Invalid input`.
- **Lists of one.** `zq.array(item)` reads `?tag=a` as `['a']` and
  `?tag=a&tag=b` as `['a', 'b']`, where `z.array` refuses the first.
- **JSON in the query string.** `zq.json(schema)` reads a filter sent as
  JSON, validates it with the schema, and lets the client send the object.
  An array is sent as its JSON text, since a query sends a list as repeated
  keys.
- **JSON Schema that matches the wire.** `zodConverter`, removed in 0.2.
