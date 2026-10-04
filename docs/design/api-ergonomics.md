# API ergonomics before 0.1.0

Status: **approved** by the owner on 2026-10-02. Each slice below is one
PR, built in the order given at the end.

Nothing is published yet (PR #1 is held), so breaking the API costs no
consumer anything. These changes are made now so that 0.1.0 starts with the
shape we intend to keep.

## Decided, not changing

- **The context stays `ctx`, typed `Context`.** There is no rename to
  `call`, and no `application` or `app.services` object. Services stay
  where `decorate` puts them, read flat in a handler (`({ db, reply })`).
  The owner chose the simpler shape.
- **A route stays `get(path, options?, handler)`.** We keep one order only.
  Accepting both orders would double every overload and make tsc's errors
  unreadable. The options are expected to go away anyway once routes come
  from codegen-alxia.

  > **Since `@alxia/core` 0.4.0** a route is
  > `get(path, options?, ...middlewares, handler)`, its schemas the
  > `validate(…)` and `responds(…)` middlewares, and its options `bodyLimit`
  > and `detail` only; see [Routes as a chain of steps](route-steps.md).
  > The examples below are written in the 0.4.0 form.

## Slice 1: shortcuts on `reply`

Today a handler answers `reply(200, body)`, `reply(201, body)`,
`reply(204)`. The shortcuts are methods of `reply` itself, not new keys on
the context. That leaves the context to what the app and its plugins add,
with no collision with a plugin that derives `ok` or `json`, and there is
one name to destructure.

```ts
app.get('/users/:id', ({ params, reply }) => {
	const user = users.get(params.id);
	return user ? reply.ok(user) : reply.notFound({ error: 'not_found' });
});

app.post('/users', validate({ body: NewUser }), responds({ 201: User }), ({ body, reply }) =>
	reply.created(insert(body)),
);

app.delete('/users/:id', ({ reply }) => reply.noContent());
```

| Shortcut | Is |
| --- | --- |
| `reply.ok(body, init?)` | `reply(200, body, init)` |
| `reply.created(body, init?)` | `reply(201, body, init)` |
| `reply.accepted(body?, init?)` | `reply(202, body, init)` |
| `reply.noContent(init?)` | `reply(204, undefined, init)` |
| `reply.badRequest(body, init?)` | `reply(400, body, init)` |
| `reply.unauthorized(body, init?)` | `reply(401, body, init)` |
| `reply.forbidden(body, init?)` | `reply(403, body, init)` |
| `reply.notFound(body, init?)` | `reply(404, body, init)` |
| `reply.conflict(body, init?)` | `reply(409, body, init)` |
| `reply.html(status, html, init?)` | a `text/html` body |

There is no `reply.json` and no `reply.text`. A string is already sent as
`text/plain`, an async iterable as `text/event-stream`, and anything else as
JSON. Only HTML needs saying.

**Typing.** Each shortcut returns the same `Reply<Status, Body>` as
`reply(status, …)`, so the client and OpenAPI see no difference. With
`response` schemas, a shortcut exists only for a status the route declares:
`reply.notFound` is a compile error on a route that declares no 404, just as
`reply(404, …)` is. That needs a probe before the slice is written. The
`TypedReplyFunction` would become a function type intersected with a mapped
type over the declared statuses. Expected cost: one type in
`core/src/app/types.ts`, plus `createReply` attaching the methods.

**Not breaking.** `reply(status, …)` stays. The shortcuts are sugar over it.

## Slice 2: what a plugin's routes call lives on the context

The rule: a plugin that gives its routes something to **do** puts it on the
context, already bound to the request. A route should never have to import
a function and pass it `ctx` and the plugin's own handle.

### janus

Today a sign-in route imports three things and passes them `ctx` and `auth`:

```ts
const signedIn = await auth.signIn(body, { device: deviceOf(ctx) });
return reply(200, { id: sendSession(ctx, auth, signedIn).id });
// and elsewhere
await signOut(ctx, auth);
```

**Revised in the slice** (owner, 2026-10-02). The first proposal had
`ctx.auth.signIn(body)` sign in by itself. That cannot work: in
`@nxgt/janus`, sign-in lives on each user type and each flow
(`accounts.patient.signIn`, `signUp`, `signInCode`, magic links, step-up…), and
each answers either a session or a challenge. So the context binds what
every flow ends with, and the sign-in call stays on the instance:

```ts
const accounts = janus({ … }); // the instance: named `accounts` in the docs, so `auth` is free

app
	.use(session(accounts))
	.post('/sign-in', validate({ body: Credentials }), async ({ body, auth, reply }) => {
		const signedIn = await accounts.patient.signIn(body, { device: auth.device });
		return reply.ok({ id: auth.send(signedIn).id }); // session cookie, device cookie
	})
	.post('/sign-out', async ({ auth, reply }) => reply.ok(await auth.signOut()));
```

- `ctx.auth` is `RequestAuth`. `device` is `deviceOf(ctx)`, `send(signedIn)`
  is `sendSession(ctx, accounts, signedIn)`, and `signOut()` is
  `signOut(ctx, accounts)`, all bound to the request.
  `SessionOptions.device` names the device cookie for both.
- The name is `auth`, as the owner chose. The docs now name the instance
  `accounts` (`janus` is the factory's name), so the context's `auth`
  shadows nothing.
- `user` and `session` stay flat, as today.
- `sendSession`, `signOut` and `deviceOf` stay exported, for code outside a
  route (a job, a test).
- A sign-in route sits behind a session that is not required. Otherwise an
  anonymous request would get its 401 before the route runs.

### The other packages

To inventory in the same slice, package by package, against the rule
above:

- `@alxia/cache` already gives `ctx.cache`.
- `@alxia/language` gives `language`.
- `@alxia/i18n` gives `t`.
- `@alxia/redis` gives `redis` and `cache`. These two collide with
  `@alxia/cache`'s `cache`; that collision is already queued as a fix.
- To check: `@alxia/jwt` (`bearer`), `@alxia/rate-limit` (resetting a key
  from a route), `@alxia/logger` (a request-bound logger), and
  `@alxia/telemetry` (the span).

## Slice 3: extending the context, typed

What exists, and stays, is `decorate` (once per app), `derive` (per
request) and `ContextOf<typeof app>`. Each types what the routes declared
after it read. That is the "order is meaning" principle in `AGENTS.md`.

Rejected: global augmentation (`declare module '@alxia/core' { interface
Context { … } }`). It would type `user` on routes declared before the plugin
that adds it, which is a lie the compiler would then repeat.

Revisited at 0.4.0, and adopted in another shape: the app registers the
chain that builds its context, never a key —
`declare module '@alxia/core' { interface Register { context: typeof base } }`.
Nothing reads it unchecked: `alxia()` and `defineMiddleware(fn)` still start
from `BaseContext`; `defineRoutes()` carries the registered context as a
requirement that `use` checks, as `definePlugin`'s; `AppContext`,
`defineMiddleware<AppContext>()` and `contextStorage()` are opted into.
The base is registered rather than the app because the app mounts the
route files, whose type reads `Register`: TypeScript would type the app
by itself, `TS7022`.

The gap is a plugin that **needs** what an earlier one added: a permission
check that reads `user`, a tenant scope that reads `session`. At the time it was
typed by hand, with `contextStorage<typeof base>()` and janus's
`permission()` generics. The slice proposes one helper, a sketch to be
probed:

```ts
const tenant = definePlugin<{ user: { tenantId: string } }>()((app) =>
	app.derive(({ user }) => ({ tenant: tenants.get(user.tenantId) })),
);

base.use(session(accounts, { required: true })).use(tenant); // ok
alxia().use(tenant); // compile error: the app gives no `user`
```

It also adds a guide page, "Writing a plugin", covering an app plugin, a
`Plugin` function, and `definePlugin` with requirements.

## Order

1. Slice 1. It is self-contained, it breaks nothing, and slice 2's
   examples use it.
2. Slice 2, janus first, then the inventory.
3. Slice 3, starting with a probe of `definePlugin`, then the guide page.

Each slice ships with its specs, including a `@ts-expect-error` for every
new compile error, the docs of every package it touches, an empty
changeset, and a review.
