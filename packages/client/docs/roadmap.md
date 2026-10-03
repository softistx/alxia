# Roadmap

What `@alxia/client` gives an app's callers, and what is coming. This page
is a direction, not a commitment: the version something shipped in is the
only number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/client/CHANGELOG.md).

## Now

Nothing scheduled yet.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **A runtime dependency.** `@alxia/client` is built on the platform's own
  `fetch`, `WebSocket` and streams, and installs nothing beside itself and
  its `@alxia/core` and `typescript` peers (core read for types only): adding it to a
  front end adds no HTTP library to audit or update.

## Shipped

### Next release

- **The 400 an app answers in its own format.** A route behind
  `@alxia/core`'s `onRefusal` hook reads that hook's reply in place of
  `ValidationErrorBody`, such as an `application/problem+json` problem with
  its members typed.
- **Named server-sent events.** An event sent with a name — every event of
  a named `eventStream({ state, ping })` — reads as `{ event, data, id? }`,
  a union discriminated by `event` with each `data` typed by its name's
  schema. An unnamed stream reads as before.

### 0.1.0

- **A client typed from the app's type alone.** `client<App>(url)` reads
  `typeof app` from an `@alxia/core` app, imported as a type: no OpenAPI
  document, no code generation, and none of the server's code in the
  bundle. One method per HTTP method the app answers — `QUERY` included —
  and only its paths compile.
- **Calls checked as you write them.** `params`, `query`, `headers`,
  `cookies` and `body` are typed by the route's schemas, and required when
  the route requires them. Parameters are encoded into the path, arrays
  repeated in the query, dates sent in ISO 8601, and a body sent as JSON
  with its `content-type`, or as is for a `FormData`, a `Blob` or a stream.
- **Results narrowed by status.** A call resolves to one member per status
  the route may answer — its replies, its guards' replies, its 400 and its
  500 — so checking `status` or `ok` types `data`, decoded from the
  response and typed as it crossed the wire.
- **Server-sent events as an async iterable.** A route that streams
  `eventStream` events resolves to an `AsyncIterable` of them, typed by
  their schema; `readEvents` reads any `text/event-stream` body. Leaving
  the loop early closes the server's generator, quietly.
- **Typed WebSockets.** `api.ws()` opens a socket whose `send`, `on` and
  `for await` are typed by the route, JSON both ways, with sends queued
  until it opens. Under Bun, its typed headers and cookies go with the
  upgrade; in a browser, which cannot send them, passing them is an error
  rather than a refused upgrade.
- **Testing without a server.** `client(app)` calls the app's `fetch` in
  process; headers for every call, a custom `fetch`, and an abort signal
  per call are options. An aborted call rejects, in process as over HTTP.
