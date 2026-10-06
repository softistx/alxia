# Roadmap

What `@alxia/di` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it.

## Now

- **A Scope per request, and `expose` (0.1).** `use(di(container, { slots }))` gives every route after it a lazy Scope, disposed of when the request ends; `deps.expose({ key: Token })` puts resolved values on the context of a group or a route, each Token checked against the Container; `app.plugin(deps.lifecycle)` disposes of the Container when the last app serving it stops.

## Next

Nothing scheduled yet.

## Later

- **Disposal after a streamed body.** The Scope is disposed of when the route answers, before a streamed body has been sent; waiting for the body's end, as `@alxia/telemetry` does for its span, would let a stream use scoped values.

## Not planned

- **`app.services`, or any registry on the app.** A route reads the Scope, or what an `expose` before it put on its context by name: what it depends on is in its own chain, checked by the types.
- **A second container.** `@alxia/di` is an adapter over `@nxgt/di`, a peer: the Tokens, the lifetimes, the captive check and the Modules are its.

## Shipped

Nothing yet.
