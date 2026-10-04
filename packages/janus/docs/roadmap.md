# Roadmap

What `@alxia/janus` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/janus/CHANGELOG.md).

## Now

Nothing scheduled yet.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **A runtime dependency.** `@alxia/janus` declares no dependency, only
  peers: it is built on `@alxia/core`'s public API, `@nxgt/janus`, and
  Bun's own cookie parser.
- **Identities of its own.** Users, passwords, sessions and permissions are
  `@nxgt/janus`'s, with your database behind its stores: this package only
  wires them into an app — the context, the cookies, the answers — so a
  flow `@nxgt/janus` adds is usable here without a release of this one.

## Shipped

### 0.1.0

- **The user in the context.** `plugin(session(accounts))` hands the routes
  after it `user`, `session` and `auth`, typed by the user schema and
  narrowed by `type`; with `required: true`, an anonymous request is a typed
  401 and `user` is never `null`. A required `session()` behind an open one
  shares its lookup.
- **Signing in and out on the context.** `ctx.auth.send(signedIn)` sets the
  session cookie — and the device cookie, with a `deviceToken` — and answers
  the user; `ctx.auth.signOut()` revokes the session and clears it;
  `ctx.auth.device` reads the device cookie, named by
  `session(accounts, { device })`. `sendSession`, `signOut` and `deviceOf`
  stay, unbound, for code outside a route.
- **The session cookie kept and renewed.** The token stays out of the body;
  a session renewed in passing is sent again, only to a client that
  presented it as a cookie, and never over one the route set itself.
- **Devices remembered.** `ctx.auth.device` and `ctx.auth.send` read and
  write the device cookie under the name `@nxgt/janus-hono` uses, so a
  device one remembers the other does too.
- **Janus's refusals answered.** `janusErrors()` answers every `JanusError`
  with its status and a body holding only what a client can act on, typed
  on the routes after it, with `Retry-After` for a throttled sign-in; an
  outage is a 503, never a 401.
- **A permission guard.** `permission(access, permission, type, load)`
  loads the object once, checks it with `@nxgt/janus/permissions`, and
  hands it to the routes as `object`; anonymous, not found and denied are
  a typed 401, 404 and 403, and a condition's context is required by the
  types exactly when the permission has one.
- **A guard that reads what an earlier plugin added.** Annotate `load`,
  `subject` or `ctx`'s parameter —
  `({ tenant }: BaseContext & { tenant: Tenant }) => …` — and it reads a
  tenant, a member or a flag an earlier plugin derived; an app that does
  not give it cannot use the guard. Unannotated, they read the request
  alone and the guard requires nothing.
- **No silent `any`.** A `load`, `subject` or `ctx` annotated `any` would
  require nothing and turn the check off; the guard is refused on every
  app instead, with a message naming the callback.
