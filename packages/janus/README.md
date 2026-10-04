# @alxia/janus

Identities, sessions and permissions for [alxia](https://www.npmjs.com/package/@alxia/core),
on [`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus): your process,
your database. The user typed in the context, the session cookie kept and
renewed, janus's refusals answered with their status and a safe body. No
dependency.

```sh
bun add @alxia/janus @nxgt/janus @alxia/core
bun add -d typescript
```

It mirrors [`@nxgt/janus-hono`](https://www.npmjs.com/package/@nxgt/janus-hono):
the same cookie, the same rules, the same bodies.

## Usage

```ts
import { alxia, validate } from '@alxia/core';
import { janusErrors, session } from '@alxia/janus';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';

const accounts = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	password: { login: 'email' },
	store: createMemoryStores(),       // your database's adapter in production
	hasher: scryptHasher(),
});

const SignIn = z.object({ email: z.string(), password: z.string() });

const app = alxia()
	.plugin(janusErrors())                                   // janus's refusals, typed
	.plugin(session(accounts))                               // not required: anonymous may sign in
	.post('/signin', validate({ body: SignIn }), async ({ body, auth, reply }) => {
		const signedIn = await accounts.signIn(body);
		return reply.ok({ id: auth.send(signedIn).id });  // the token in the cookie
	})
	.post('/signout', async ({ auth, reply }) => reply.ok(await auth.signOut()))
	.plugin(session(accounts, { required: true }))           // every route after it
	.get('/me', ({ user, reply }) => reply.ok(user));     // user typed by the schema
```

## `session(accounts, options?)`

The routes after it read `user`, `session` and `auth`. With
`required: true`, an anonymous request is a 401
`{ error: 'unauthenticated' }` and `user` is never `null`; without, it is
`null` for an anonymous request. A `boolean` known only at run time types
both: the 401, and a `user` that may be `null`. `type` narrows to one user
type of a multi-type `janus()`; `device` names the device cookie.

The session is read from `Authorization: Bearer`, `X-Session-Token`, or the
cookie. One renewed in passing is sent again as a cookie after the route —
only to a request that presented it as one, and never over a session
cookie the route set itself. **An outage is not anonymous**: a store that
cannot answer is `STORE_FAILED`, answered 503 by `janusErrors()`.

## `ctx.auth`: signing in and out

Sign-in stays on your `janus()` instance — `accounts.signIn`, `accounts.signUp`,
`accounts.patient.signIn`, a code, a link — and `ctx.auth` does the request's
part, bound to it:

| `ctx.auth.` | |
| --- | --- |
| `send(signedIn)` | sets the session cookie (and the device cookie, with a `deviceToken`) and returns the user: the token is never in a body |
| `signOut()` | revokes the request's session and clears its cookie, whatever the answer |
| `device` | the device cookie's value, or `null`, for `signIn(…, { device: ctx.auth.device })` with `janus({ devices })` |

Put the sign-in routes behind a `session(accounts)` that is **not** required:
behind `required: true`, an anonymous request — anyone signing in — is a
401. Outside a route (a job, a test), `sendSession(ctx, accounts, signedIn)`,
`signOut(ctx, accounts)` and `deviceOf(ctx)` are the same functions, unbound.

## `janusErrors(options?)`

Every `JanusError` a route after it throws is answered with janus's status
and a body holding its `code` and only what a client can act on — the
issues, a minimum length, attempts left, seconds to wait (with
`Retry-After`). Never a login, a reason or a cause. `report(error, ctx)` is
called for the 5xx.

| status | codes |
| --- | --- |
| 400 | `USER_INVALID`, `PASSWORD_TOO_SHORT`, `TOKEN_*`… |
| 401 | `CREDENTIALS_INVALID`, `CODE_INVALID` |
| 403 | `USER_INACTIVE`, `STEP_UP_REQUIRED` |
| 404 | `NOT_FOUND` |
| 409 | `LOGIN_TAKEN`, `VERSION_CONFLICT`, `SECOND_FACTOR_*` |
| 500 | `PERMISSION_DEPTH` |
| 501 | `UNSUPPORTED` |
| 503 | `STORE_FAILED` |

## `permission(access, permission, type, load, options?)`

A guard on `@nxgt/janus/permissions`: the routes after it run only if the
subject — the session's `user`, or `options.subject(ctx)` — holds
`permission` on the object `load` finds, which they read as `object`.
Anonymous is a 401, nothing loaded a 404, a denial a 403, each typed. Scope
it with `group`:

```ts
import { alxia } from '@alxia/core';
import { byParam, janusErrors, permission, session } from '@alxia/janus';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { createMemoryRelations, defineModel, permissions } from '@nxgt/janus/permissions';
import { z } from 'zod';

const relations = createMemoryRelations();
const accounts = janus({
	user: z.object({ email: z.email() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	relations,
	hasher: scryptHasher(),
});
const access = permissions({
	model: defineModel({
		subjects: accounts.types,
		types: { record: { related: { owners: ['user'] }, permits: { view: ['owners'] } } },
	}),
	store: relations,
});

const records = new Map([['r1', { id: 'r1', title: 'Blood test' }]]);
const findRecord = (id: string) => records.get(id) ?? null;

const app = alxia()
	.plugin(janusErrors())
	.plugin(session(accounts))
	.group('/records/:id', (record) =>
		record
			.plugin(permission(access, 'view', 'record', byParam('id', findRecord)))
			.get('/', ({ object, reply }) => reply(200, object)), // object: what findRecord found
	);
```

`byParam(name, find)` loads by a path parameter. A permission whose
condition needs a context takes `ctx: (ctx, object) => …`, required by the
types exactly then.

### Reading the app's context

Annotate `load`, `subject` or `ctx`'s parameter to read what an earlier
plugin added. The guard then requires it: an app that does not give it
before the guard cannot use it.

```ts
import type { BaseContext } from '@alxia/core';

const byTenant = permission(
	access,
	'view',
	'record',
	({ tenant, pathParams }: BaseContext & { tenant: { records: Map<string, { id: string; title: string }> } }) =>
		tenant.records.get(pathParams['id'] ?? '') ?? null,
);

alxia().plugin(tenancy).plugin(session(accounts)).plugin(byTenant); // tenancy derives tenant
alxia().plugin(session(accounts)).plugin(byTenant); // a compile error: this app gives no `tenant`
```

A callback annotated `any` would require nothing, so the guard is refused
on every app: annotate what it reads, or leave it unannotated.

## API

| export | |
| --- | --- |
| `session(accounts, options?)` | the plugin: `user`, `session`, `auth` |
| `SessionOptions` | its options: `type`, `required`, `device` |
| `RequestAuth`, `SessionOpened` | the type of `ctx.auth`: `send`, `signOut`, `device`; and what `send` takes: `token`, `session` and `user` from `@nxgt/janus`'s `SignedIn`, and `deviceToken?` |
| `sendSession`, `signOut`, `deviceOf`, `sendDevice` | the cookies, outside a route |
| `DEVICE_COOKIE` | the device cookie's name, `janus-device`: the one `@nxgt/janus-hono` uses, so a device one remembers the other does too |
| `SendSessionOptions`, `DeviceCookieOptions` | their options: `device`; `name`, `domain`, `path`, `sameSite`, `secure`, `maxAge` |
| `janusErrors(options?)` | the plugin: janus's refusals answered |
| `JanusErrorsOptions` | its options: `report`, called with every error answered 5xx |
| `permission(…)`, `byParam(…)` | the guard |
| `PermissionOptions`, `OptionsArgs` | its options: `subject`, `ctx`; and the rest of its arguments, the options required exactly when the permission has a condition; both take what `subject` and `ctx` read beyond `BaseContext` as their last two, defaulted, parameters |
| `bodyOf`, `statusOf` | a refusal's body and status |
| `UnauthenticatedBody`, `JanusErrorBody`, `PermissionRefusedBody` | their types |
| `Auth`, `UserOfAuth`, `ObjectData`, `Awaitable` | the part of `janus()` this package calls, the users it knows, an object as the application loads it, a value or its promise |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/janus/docs): a page per area — sessions, signing in and out with `ctx.auth` and the device cookie, janus's errors and their statuses, and the permission guard, reading what an earlier plugin added included.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/janus/docs/troubleshooting.md): an error message, or a request anonymous, refused or a 404 when it should not be, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/janus/docs/roadmap.md): what is coming, and what is not planned.
