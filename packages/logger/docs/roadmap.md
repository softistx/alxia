# Roadmap

What `@alxia/logger` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/logger/CHANGELOG.md).

## Now

- **A middleware, not a plugin (0.4).** `app.use(logger())` logs every request, a 404, a 405 or a 500 included, and times everything after it. `app.plugin(logger())`, the deprecated form, was removed in 0.5.

## Next

- **Each operation over a socket.** A `ws: true` connection is logged at its upgrade alone: its operations — a query, a mutation, a subscription's stream — name no operation yet, because the request is answered before they run.


## Later

Nothing scheduled yet.

## Not planned

- **A logging library inside the package.** `@alxia/logger` installs
  nothing beside `@alxia/core` and stays that way. It makes the entries and
  hands each to `write`, so they go to the logger, the file or the service
  the app already uses, with no transitive package to audit or update.

## Shipped

### Next release

- **The GraphQL operation on the line.** Behind `@alxia/graphql`, an entry carries `operationName` and `operationType` (`batch` for an array body, with every name), so `POST /graphql` says whether it was `GetNotes` or `AddNote` ([guide](guide.md#a-graphql-operation)).

### 0.2.0

- **A streamed body is logged once it has been sent.** A page rendered as
  it goes, or an event stream, gets its entry when its body ends: its
  `duration` to the last byte, `timeToHeaders` beside it, and an `outcome`
  that tells a body sent whole from one its client left (`warn`) or one
  that failed (`error`). A body of known length is still logged at once,
  and left as it is.

### 0.1.0

- **A request id.** Every request gets an id, kept from the incoming
  `X-Request-Id` when it is a safe one, or made with `crypto.randomUUID`,
  and sent back on the response. The header, the generator and whether an
  incoming id is trusted are options; a generated id that is not a safe one
  falls back to a UUID.
- **One structured entry per request.** Once answered, each request writes
  one entry with its method, path, status, duration and client address, at
  `info`, `warn` for a 4xx or `error` for a 5xx, as a JSON line on stdout or
  through a `write` of your own. `skip` leaves out a health check. Logging
  never breaks a request: a `write`, `skip` or `generateId` that throws, or
  an `async` `write` that rejects, is reported on `console.error`, and the request is answered as it would be.
- **`Server-Timing`.** The response says how long it took, for the
  browser's developer tools, unless turned off.
- **A log bound to the request.** The routes after it read a typed
  `requestId` and a `log` whose `info`, `warn` and `error` entries carry the
  request's id.
