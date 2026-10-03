# Troubleshooting

Each entry is headed by the text you see: a TypeScript error, an exception
in the log, or a response. A trap that prints nothing is headed by its
symptom, under [Traps](#traps).

**Types: sessions and cookies**

- [`Property 'user' does not exist on type 'Context<…>'`](#property-user-does-not-exist-on-type-context)
- [`Property 'auth' does not exist on type 'Context<…>'`](#property-auth-does-not-exist-on-type-context)
- [`'user' is possibly 'null'`](#user-is-possibly-null)
- [`Type '"admin"' is not assignable to type '"user"'`](#type-admin-is-not-assignable-to-type-user)
- [`Type 'SecondFactorRequired' is missing the following properties from type 'SessionOpened<User<…>>': token, session, user`](#type-secondfactorrequired-is-missing-the-following-properties-from-type-sessionopeneduser-token-session-user)
- [`Property 'error' is missing in type '{ code: JanusErrorCode; … }'`](#property-error-is-missing-in-type--code-januserrorcode--)

**Types: permissions**

- [`Property 'object' does not exist on type 'Context<…>'`](#property-object-does-not-exist-on-type-context)
- [`Argument of type '"delete"' is not assignable to parameter of type 'CheckableOf<…>'`](#argument-of-type-delete-is-not-assignable-to-parameter-of-type-checkableof)
- [`Expected 5 arguments, but got 4.`](#expected-5-arguments-but-got-4)
- [`Type '() => { locked: boolean; }' is not assignable to type 'undefined'`](#type----locked-boolean--is-not-assignable-to-type-undefined)
- [`Property 'doctorId' is missing in type '{ … }' but required in type '{ readonly doctorId: string | null; }'`](#property-doctorid-is-missing-in-type----but-required-in-type--readonly-doctorid-string--null-)
- [`Property 'tenant' does not exist on type 'BaseContext'`](#property-tenant-does-not-exist-on-type-basecontext)
- [`the plugin reads "tenant", which this app's context does not give: use the plugin that adds it first`](#the-plugin-reads-tenant-which-this-apps-context-does-not-give-use-the-plugin-that-adds-it-first)
- [`the plugin reads "tenant", which this app's context gives with another type`](#the-plugin-reads-tenant-which-this-apps-context-gives-with-another-type)

**Runtime**

- [`TypeError: permission(): no user in the context — use session(auth) before it, or pass { subject }`](#typeerror-permission-no-user-in-the-context--use-sessionauth-before-it-or-pass--subject-)
- [`TypeError: signIn: a device was given, but janus() has no devices — pass devices: { keys }`](#typeerror-signin-a-device-was-given-but-janus-has-no-devices--pass-devices--keys-)
- [`Warning: janusErrors(): report failed: …`](#warning-januserrors-report-failed-)
- [`500 {"error":"internal"}`, with a `JanusError` in the log](#500-errorinternal-with-a-januserror-in-the-log)
- [`503 {"code":"STORE_FAILED"}`](#503-codestore_failed)
- [`401 {"error":"unauthenticated"}` from the sign-in route](#401-errorunauthenticated-from-the-sign-in-route)
- [`401 {"code":"CREDENTIALS_INVALID","retryAfter":900}` with the right password](#401-codecredentials_invalidretryafter900-with-the-right-password)

**Traps**

- [Signed in, and the next request is anonymous](#signed-in-and-the-next-request-is-anonymous)
- [A client with a token never gets a renewed cookie](#a-client-with-a-token-never-gets-a-renewed-cookie)
- [A user of another type gets a 401](#a-user-of-another-type-gets-a-401)
- [Every guarded route answers 404](#every-guarded-route-answers-404)
- [Routes that have nothing to do with the object answer 401 or 404](#routes-that-have-nothing-to-do-with-the-object-answer-401-or-404)

## Types: sessions and cookies

### `Property 'user' does not exist on type 'Context<…>'`

**When:** a route reads `user` or `session`, and is declared before
`use(session(accounts))`.

```text
error TS2339: Property 'user' does not exist on type 'Context<Empty, "/profile", Empty>'.
```

**Why:** `session()` adds `user` and `session` to the routes declared
**after** it. The route before it is not authenticated at all.

**Fix:** declare the route after the plugin:

```ts
alxia()
	.use(session(accounts, { required: true }))
	.get('/profile', ({ user, reply }) => reply(200, { name: user.name }));
```

### `Property 'auth' does not exist on type 'Context<…>'`

**When:** a sign-in or sign-out route calls `ctx.auth.send`,
`ctx.auth.signOut` or reads `ctx.auth.device`, and is declared before
`use(session(accounts))`.

```text
error TS2339: Property 'auth' does not exist on type 'Context<Empty, "/signin", Empty>'.
```

**Why:** `ctx.auth` is added by `session()`, to the routes declared
**after** it, like `user`.

**Fix:** use a `session()` that is not required before the route — or keep
the route where it is and call the unbound `sendSession(ctx, accounts, …)`,
`signOut(ctx, accounts)` and `deviceOf(ctx)`
([Signing in and out](guide/sign-in-and-out.md#outside-a-route-sendsession-signout-deviceof)):

```ts
alxia()
	.use(session(accounts))
	.post('/signin', { body: SignIn }, async ({ body, auth, reply }) => {
		const signedIn = await accounts.signIn(body);
		return reply.ok({ id: auth.send(signedIn).id });
	});
```

### `'user' is possibly 'null'`

**When:** reading a field of `user` behind `session(accounts)` without
`required: true`.

```text
error TS18047: 'user' is possibly 'null'.
```

**Why:** without `required`, or with `required` given a `boolean` known
only at run time, an anonymous request may reach the route with
`user: null`.

**Fix:** answer the anonymous case, or require the session with a literal
`true`, so the plugin answers it with a 401 and `user` is never `null`:

```ts
alxia().use(session(accounts, { required: true })).get('/me', ({ user, reply }) => reply(200, user.email));
```

### `Type '"admin"' is not assignable to type '"user"'`

**When:** `session(accounts, { type })` names a type `janus()` does not have.
With a single `user` schema, the only type is `'user'`.

```text
error TS2769: No overload matches this call.
  Overload 1 of 3, '(auth: Janus<…>, options: SessionOptions<…> & { …; }): Al…', gave the following error.
    Type '"admin"' is not assignable to type '"user"'.
```

**Why:** `type` narrows `user` to one of `janus()`'s user types; the types
are the keys of `janus({ users })`.

**Fix:** use one of those keys, or declare the type in `janus({ users: { … } })`.

### `Type 'SecondFactorRequired' is missing the following properties from type 'SessionOpened<User<…>>': token, session, user`

**When:** calling `ctx.auth.send` or `sendSession` with what `signIn`
answered, in a `janus()` given a `secondFactor`.

```text
error TS2345: Argument of type 'SignInResult<User<"user", { email: string; }>>' is not assignable to parameter of type 'SessionOpened<User<"user", { email: string; }>>'.
  Type 'SecondFactorRequired' is missing the following properties from type 'SessionOpened<User<"user", { email: string; }>>': token, session, user
```

**Why:** with a second factor, `signIn` answers either a session or a
challenge, and a challenge has no session to put in a cookie.

**Fix:** switch on `status` first
([Signing in and out](guide/sign-in-and-out.md#a-second-factor)):

```ts
const result = await accounts.signIn(body);
if (result.status === 'secondFactor') return reply.ok({ challenge: result.challenge });
return reply.ok({ id: auth.send(result).id });
```

### `Property 'error' is missing in type '{ code: JanusErrorCode; … }'`

**When:** a client reads a 401 from a route behind
`session(accounts, { required: true })` and `janusErrors()` as the session's
body only.

```text
error TS2322: Type '{ error: "unauthenticated"; } | { code: JanusErrorCode; issues?: …; minLength?: number; attemptsLeft?: number; retryAfter?: number; }' is not assignable to type '{ error: "unauthenticated"; }'.
  Property 'error' is missing in type '{ code: JanusErrorCode; … }' but required in type '{ error: "unauthenticated"; }'.
```

**Why:** two 401s are possible there: the session's own
`{ error: 'unauthenticated' }`, and janus's `{ code }` — a refused code
or password — through `janusErrors()`.

**Fix:** narrow on the key ([Errors](guide/errors.md#on-the-client)):

```ts
if (me.status === 401) {
	if ('error' in me.data) console.log('sign in first');
	else console.log(me.data.code);
}
```

## Types: permissions

### `Property 'object' does not exist on type 'Context<…>'`

**When:** a route reads `object` and is not behind `permission()`.

```text
error TS2339: Property 'object' does not exist on type 'Context<Empty & { readonly user: …; readonly session: Session; }, "/records/:id", Empty>'.
```

**Why:** the guard adds `object` to the routes declared after it, in the
app or group it is used in.

**Fix:** declare the route in the guard's group, after it:

```ts
app.group('/records/:id', (record) =>
	record
		.use(permission(access, 'view', 'record', byParam('id', findRecord)))
		.get('/', ({ object, reply }) => reply(200, object)),
);
```

### `Argument of type '"delete"' is not assignable to parameter of type 'CheckableOf<…>'`

**When:** `permission()` names a permission the model does not define for
that type.

```text
error TS2345: Argument of type '"delete"' is not assignable to parameter of type 'CheckableOf<{ readonly subjects: readonly "user"[]; readonly types: { readonly record: { … }; }; }, "record">'.
```

**Why:** the permission is checked against the model's `permits` for
`type`.

**Fix:** add it to the model's `permits`, or use one that is there.

### `Expected 5 arguments, but got 4.`

**When:** `permission()` names a permission whose rule has a `when(…)`
condition, and is given no options.

```text
error TS2554: Expected 5 arguments, but got 4.
```

**Why:** a condition needs a context to decide, and only the app can build
it from the request and the object.

**Fix:** pass `ctx` ([Permissions](guide/permissions.md#a-condition-optionsctx)):

```ts
permission(access, 'edit', 'record', byParam('id', findRecord), {
	ctx: (_ctx, object) => ({ locked: object.locked }),
});
```

### `Type '() => { locked: boolean; }' is not assignable to type 'undefined'`

**When:** passing `ctx` to `permission()` for a permission with no
condition.

```text
error TS2322: Type '() => { locked: boolean; }' is not assignable to type 'undefined'.
```

**Why:** `ctx` would never be read: the types refuse it rather than let it
look like it matters.

**Fix:** drop `ctx`, or check the permission that has the condition.

### `Property 'doctorId' is missing in type '{ … }' but required in type '{ readonly doctorId: string | null; }'`

**When:** the model has a `fromField('doctorId', …)` relation on the type,
and `load` answers an object without that field.

```text
error TS2345: Argument of type '(ctx: BaseContext) => Awaitable<{ id: string; title: string; } | null>' is not assignable to parameter of type '(ctx: BaseContext) => Awaitable<ObjectData<…, "record"> | null>'.
  …
        Property 'doctorId' is missing in type '{ id: string; title: string; }' but required in type '{ readonly doctorId: string | null; }'.
```

**Why:** `can` reads that field from the loaded object to find who is
related through it, so the types require it on what `load` answers.

**Fix:** load the field, as a `string` or `null`:

```ts
byParam('id', (id) => db.records.findOne({ id }, { projection: { title: 1, doctorId: 1 } }));
```

### `Property 'tenant' does not exist on type 'BaseContext'`

```text
error TS2339: Property 'tenant' does not exist on type 'BaseContext'.
```

**When:** `load`, `subject` or `ctx` reads something a `derive` or a plugin
before the guard added — a tenant, a member — and its parameter is not
annotated: `load: (ctx) => ctx.tenant.records.get(…)`.

**Why:** an unannotated callback is typed with the request's `BaseContext`
— the request, the URL, the path parameters — not with what other hooks
added. `permission()` is built before it is used, so it cannot see the app
it will be used on.

**Fix:** annotate the parameter with what it reads. The guard infers it,
and the app that uses it must then give it, before the guard:

```ts
import type { BaseContext } from '@alxia/core';

const byTenant = permission(access, 'view', 'record', ({ tenant, pathParams }: BaseContext & { tenant: Tenant }) =>
	tenant.records.get(pathParams['id'] ?? '') ?? null,
);

app.use(tenancy).use(byTenant); // tenancy derives tenant
```

See [Reading the app's context](guide/permissions.md#reading-the-apps-context).

### `the plugin reads "tenant", which this app's context does not give: use the plugin that adds it first`

```text
error TS2769: No overload matches this call.
  …
        Types of property ''~requires'' are incompatible.
          Type '{ tenant: Tenant; }' is not assignable to type '"the plugin reads \"tenant\", which this app's context does not give: use the plugin that adds it first"'.
```

**When:** a callback of the guard is annotated to read `tenant`, and the
guard is used on an app — or in a group — whose context has no `tenant` at
that point: `alxia().use(byTenant)`, or `use(byTenant)` before
`use(tenancy)`.

**Why:** an annotated `load`, `subject` or `ctx` makes the guard require
what it reads, and `use` checks the app's context against it, so the
callback never runs without it.

**Fix:** use the plugin that adds `tenant` first:

```ts
app.use(tenancy).use(byTenant);
```

More on this message in
[`@alxia/core`'s troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/core/docs/troubleshooting.md#the-plugin-reads--which-this-apps-context-does-not-give-use-the-plugin-that-adds-it-first).

### `the plugin reads "tenant", which this app's context gives with another type`

```text
error TS2769: No overload matches this call.
  …
          Type '{ tenant: Tenant; }' is not assignable to type '"the plugin reads \"tenant\", which this app's context gives with another type"'.
```

**When:** the app gives a `tenant`, but of a type that does not fit the one
the callback's parameter is annotated with: a `Tenant | null` where `load`
reads `Tenant`, or a tenant of another shape.

**Why:** `use` checks each key the guard reads against the app's context;
a narrower type passes, a wider or different one does not.

**Fix:** annotate the callback with the type the app gives, and handle it
inside — a `null` tenant loads nothing, a 404:

```ts
permission(access, 'view', 'record', ({ tenant, pathParams }: BaseContext & { tenant: Tenant | null }) =>
	tenant?.records.get(pathParams['id'] ?? '') ?? null,
);
```

More on this message in
[`@alxia/core`'s troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/core/docs/troubleshooting.md#the-plugin-reads--which-this-apps-context-gives-with-another-type).

## Runtime

### `TypeError: permission(): no user in the context — use session(auth) before it, or pass { subject }`

**When:** a request reaches a `permission()` guard; it is answered
`500 {"error":"internal"}`.

**Why:** with no `subject` option, the guard reads the `user` `session()`
derived, and no `session()` was used before it. It throws rather than
treat everyone as anonymous.

**Fix:** use `session(accounts)` before the guard, or name the subject:

```ts
app
	.use(session(accounts))
	.group('/records/:id', (record) =>
		record.use(permission(access, 'view', 'record', byParam('id', findRecord))).get('/', ({ object, reply }) => reply(200, object)),
	);
```

### `TypeError: signIn: a device was given, but janus() has no devices — pass devices: { keys }`

**When:** every sign-in or sign-up passing `{ device: ctx.auth.device }` or
`{ device: deviceOf(ctx) }` is answered `500 {"error":"internal"}` (the
message starts with `signUp:` for a sign-up).

**Why:** `ctx.auth.device` and `deviceOf` are `null` for a browser with no
device cookie, and `janus()` reads `device: null` as a device given — "this client holds no
token yet". Without `janus({ devices })` it has nothing to sign one with.

**Fix:** configure `devices`, or leave `device` out:

```ts
const accounts = janus({
	user: z.object({ email: z.email() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
	devices: { keys: [{ id: '2026-09', key: Bun.env['DEVICES_KEY'] ?? '' }] }, // openssl rand -base64 32
});
```

### `Warning: janusErrors(): report failed: …`

**When:** a 5xx was answered, and the `report` function given to
`janusErrors()` threw or rejected.

```text
(node:13837) Warning: janusErrors(): report failed: Error: boom
```

**Why:** `report` cannot change the answer: the 503 was sent all the same,
and the failure is a process warning.

**Fix:** make `report` safe — the logger or error tracker it calls is the
one failing.

### `500 {"error":"internal"}`, with a `JanusError` in the log

**When:** a `janus()` refusal — `NotFoundError`, a refused password —
thrown by a route is answered 500 instead of its own status.

**Why:** the route is declared before `use(janusErrors())`, which answers
only the routes after it.

**Fix:** use `janusErrors()` first:

```ts
const app = alxia()
	.use(janusErrors())
	.use(session(accounts))
	.post('/signin', { body: SignIn }, async ({ body, auth, reply }) => {
		const signedIn = await accounts.signIn(body); // a refusal is now its 401
		return reply.ok({ id: auth.send(signedIn).id });
	});
```

### `503 {"code":"STORE_FAILED"}`

**When:** every authenticated request, while the identity or relation store
is unreachable.

**Why:** intended. A store that cannot answer makes `authenticate` and
`can` throw `STORE_FAILED`, and `janusErrors()` answers it 503 — never a
401, which would send every signed-in user to the sign-in page, nor a 403.
Routes declared before `session()` still answer.

**Fix:** the store. Pass `report` to `janusErrors()` to hear about it:

```ts
janusErrors({ report: (error, ctx) => console.error(ctx.route, error.code, error.cause) });
```

### `401 {"error":"unauthenticated"}` from the sign-in route

**When:** every sign-in, sign-up or sign-out of a request with no session
is answered `401 {"error":"unauthenticated"}`, and the route never runs.

**Why:** the route is declared after `session(accounts, { required: true })`,
which answers an anonymous request before any route behind it — and
whoever signs in is anonymous.

**Fix:** declare it behind a `session()` that is not required, and require
the session for the routes after it, or in a `group`
([Sessions](guide/sessions.md#where-the-sign-in-routes-go)):

```ts
alxia()
	.use(janusErrors())
	.use(session(accounts))                     // the sign-in routes
	.post('/signin', { body: SignIn }, async ({ body, auth, reply }) => {
		const signedIn = await accounts.signIn(body);
		return reply.ok({ id: auth.send(signedIn).id });
	})
	.use(session(accounts, { required: true })) // everything after
	.get('/me', ({ user, reply }) => reply.ok({ name: user.name }));
```

### `401 {"code":"CREDENTIALS_INVALID","retryAfter":900}` with the right password

**When:** signing in after many failed attempts at the same login; the
response carries `Retry-After: 900`.

**Why:** `janus()` throttles password guessing by default: past ten
passwords tried at one login in fifteen minutes, `signIn` refuses until the
next window, the right password included. Nothing is locked.

**Fix:** wait `retryAfter` seconds, and show it to the user. The throttle is
`janus({ signIn: { throttle } })`'s, in `@nxgt/janus`.

## Traps

### Signed in, and the next request is anonymous

**When:** the sign-in answers 200 with a `Set-Cookie`, and the next request
from a browser reaches `session()` with no cookie.

**Why:** the session cookie is `Secure` by default (`janus()`'s
`cookie.secure`), and is set on `Path=/` for the host that answered.
A browser does not keep a `Secure` cookie sent over plain `http://` from
a host other than `localhost`, nor send a cookie to another host.

**Fix:** serve over HTTPS; for a plain-HTTP development host, turn it off
there only:

```ts
const accounts = janus({
	user: z.object({ email: z.email() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
	cookie: { secure: Bun.env['NODE_ENV'] === 'production' },
});
```

For an API on another subdomain, set `cookie.domain`.

### A client with a token never gets a renewed cookie

**When:** a client sending `Authorization: Bearer` or `X-Session-Token`
never receives a `Set-Cookie`, even when its session was renewed.

**Why:** intended. `session()` sends a renewed session again only to a
request that presented it as a cookie: the token itself does not change, so
a bearer client keeps using it. Neither does a route that set its own
session cookie get a second one.

**Fix:** none needed. A bearer client that wants the new expiry reads
`session.expiresAt` from a route that answers it.

### A user of another type gets a 401

**When:** a signed-in user is answered `401 {"error":"unauthenticated"}`
on routes behind `session(accounts, { type, required: true })`.

**Why:** a user of another type than `type` is anonymous there, by design.
So is a request whose **first** credential is lapsed: `Authorization:
Bearer` is read before `X-Session-Token`, then the cookie, and a stale
bearer beside a live cookie is anonymous.

**Fix:** sign in as that type, or stop sending the stale header.

### Every guarded route answers 404

**When:** a signed-in user allowed on the object gets
`404 {"error":"not_found"}` from every route behind `permission()`.

**Why:** `byParam(name, …)` reads a path parameter of that name; a group
whose path has no such parameter — `/records/:recordId` with
`byParam('id', …)` — answers `null`, a 404. The name is a string: a typo
compiles.

**Fix:** use the parameter's name as declared in the path:

```ts
app.group('/records/:recordId', (record) =>
	record.use(permission(access, 'view', 'record', byParam('recordId', findRecord))).get('/', ({ object, reply }) => reply(200, object)),
);
```

### Routes that have nothing to do with the object answer 401 or 404

**When:** after adding `permission()`, routes such as `/health` answer 401
or 404.

**Why:** the guard applies to every route declared after it in the app or
group it is used in. Used at the top of the app, it guards them all.

**Fix:** use it inside the `group` of the routes about the object
([Permissions](guide/permissions.md#scope-it-with-group)).
