# Roadmap

What `@alxia/openapi` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/openapi/CHANGELOG.md).

## Now

Nothing scheduled yet.

## Next

Nothing scheduled yet.

## Later

- **The default 400 beside a hook that may fall back to it.** An
  `onRefusal` hook that returns nothing for some refusals lets the default
  `ValidationError` 400 answer them — or, for a hook of one kind, the
  general hook — and the document does not show it beside the hook's
  schemas yet. The client's type already does.

## Not planned

- **Knowing a validator by name.** `@alxia/openapi` reads every schema
  through Standard Schema and Standard JSON Schema, and names no library:
  what only one validator needs lives beside it, as Zod's converter lives
  in `@alxia/zod`. A validator is supported by carrying Standard JSON
  Schema, or by a `convert` function.
- **A runtime dependency.** The package installs nothing beside itself and
  its `@alxia/core` and `typescript` peers: no validator, no JSON Schema library, and no
  reference page bundled in it — the page served at `/docs` loads its
  viewer from a CDN in the browser.

## Shipped

### Next release

- **Refusals by kind.** Behind `onRefusal('validation', …)` and
  `onRefusal('body_limit', …)`, a route documents each kind's statuses
  only where that kind may refuse it: the validation hook's on a route that
  validates, the body-limit hook's on one under a `bodyLimit`. A kind with
  no hook of its own documents the general hook's, or its default.
- **Refusals as the app answers them.** A route behind an `onRefusal`
  hook documents what the hook declares — an RFC 9457 problem under
  `application/problem+json`, for one — in place of the `ValidationError`
  400; a hook without schemas, a `4XX`.
- **Named server-sent events.** A stream of named events,
  `eventStream({ state, ping })`, is documented as `text/event-stream`
  with one object per event name in its `itemSchema`: the name as a
  `const`, the data by its schema, the `id` and `retry` fields.
- **The 413 of a body limit.** A route under a `bodyLimit`, its own or
  inherited from `bodyLimit()`, documents a `413` with the
  `ContentTooLargeError` body, its description naming the limit — or,
  behind an `onRefusal` hook given schemas, the hook's `413`.

### 0.1.0

- **An OpenAPI 3.2 document from the routes you already wrote.**
  `openapi(app, options)` documents every HTTP route of an `@alxia/core`
  app from its schemas — paths, parameters, request body, each reply, a
  `QUERY` route as its path's `query` operation — so
  the document cannot drift from the code. `info`, `servers` and an
  `exclude` filter shape it.
- **Each side of a schema where it belongs.** Parameters and bodies are
  documented by what their schema accepts, replies by what it gives back;
  an event stream is `text/event-stream` by the schema of one event, as its `itemSchema`, a
  string reply is `text/plain`.
- **The errors every route can answer.** A `400` with the validation error
  body on every route that validates its request, and a `500` on every
  route, as shared components — beside a route's own `400` or `500`.
- **Any validator.** Schemas convert through Standard JSON Schema, which
  Zod 4.2 and later, ArkType and Valibot carry; a `convert` function runs
  first, for a validator that carries none or to say more than it does.
  `toJsonSchema` converts a single schema the same way.
- **Names a client generator can use.** Paths as OpenAPI writes them
  (`/users/{id}`), operation ids from the method and path (`getUsersById`)
  unless `detail.operationId` sets one, and `detail`'s summary,
  description, tags and deprecation copied onto each operation.
- **The document served, with a page to read it.** The `docs` plugin
  serves the document at `/openapi.json` and an API reference page at
  `/docs`, both movable and the page optional, under any prefix or group,
  and leaves its own routes out of the document.
