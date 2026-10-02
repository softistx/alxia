# @alxia/janus

Identities, sessions and permissions for [alxia](https://www.npmjs.com/package/@alxia/core),
on [`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus): your process,
your database. The user typed in the context, the session cookie kept and
renewed, janus's refusals answered — every one typed for the client. No
dependency.

```sh
bun add @alxia/janus @nxgt/janus @alxia/core
bun add -d typescript@^6.0.3
```

It mirrors [`@nxgt/janus-hono`](https://www.npmjs.com/package/@nxgt/janus-hono):
the same cookie, the same rules, the same bodies.

## Usage

```ts
import { alxia } from '@alxia/core';
import { janusErrors, sendSession, session, signOut } from '@alxia/janus';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';

const auth = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	password: { login: 'email' },
	store: createMemoryStores(),       // your database's adapter in production
	hasher: scryptHasher(),
});

const SignIn = z.object({ email: z.string(), password: z.string() });

const app = alxia()
	.use(janusErrors())                                  // janus's refusals, typed
	.post('/signin', { body: SignIn }, async (ctx) => {
		const signedIn = await auth.signIn(ctx.body);
		return ctx.reply(200, { id: sendSession(ctx, auth, signedIn).id }); // the token in the cookie
	})
	.post('/signout', async (ctx) => ctx.reply(200, await signOut(ctx, auth)))
	.use(session(auth, { required: true }))              // every route after it
	.get('/me', ({ user, reply }) => reply(200, user));  // user typed by the schema
```

## `session(auth, options?)`

The routes after it read `user` and `session`. With `required: true`, an
anonymous request is a 401 `{ error: 'unauthenticated' }` and `user` is
never `null`; without, it is `null` for an anonymous request. `type` narrows
to one user type of a multi-type `janus()`.

The session is read from `Authorization: Bearer`, `X-Session-Token`, or the
cookie. One renewed in passing is sent again as a cookie after the route —
only to a request that presented it as one, and never over a session
cookie the route set itself. **An outage is not anonymous**: a store that
cannot answer is `STORE_FAILED`, answered 503 by `janusErrors()`.

## `sendSession`, `signOut`, devices

`sendSession(ctx, auth, signedIn)` sets the session cookie after `signUp`
or `signIn` and returns the user: the token is never in a body. With a
`deviceToken` it sets the device cookie too; `deviceOf(ctx)` reads it back
for `signIn(…, { device })`. `signOut(ctx, auth)` revokes the session and
clears the cookie, whatever the answer.

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
const auth = janus({
	user: z.object({ email: z.email() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	relations,
	hasher: scryptHasher(),
});
const access = permissions({
	model: defineModel({
		subjects: auth.types,
		types: { record: { related: { owners: ['user'] }, permits: { view: ['owners'] } } },
	}),
	store: relations,
});

const records = new Map([['r1', { id: 'r1', title: 'Blood test' }]]);
const findRecord = (id: string) => records.get(id) ?? null;

const app = alxia()
	.use(janusErrors())
	.use(session(auth))
	.group('/records/:id', (record) =>
		record
			.use(permission(access, 'view', 'record', byParam('id', findRecord)))
			.get('/', ({ object, reply }) => reply(200, object)), // object: what findRecord found
	);
```

`byParam(name, find)` loads by a path parameter. A permission whose
condition needs a context takes `ctx: (ctx, object) => …`, required by the
types exactly then.

## API

| export | |
| --- | --- |
| `session(auth, options?)` | the plugin: `user`, `session` |
| `SessionOptions` | its options: `type`, `required` |
| `sendSession`, `signOut`, `deviceOf`, `sendDevice` | cookies |
| `DEVICE_COOKIE` | the device cookie's name, `janus-device`: the one `@nxgt/janus-hono` uses, so a device one remembers the other does too |
| `SendSessionOptions`, `DeviceCookieOptions` | their options: `device`; `name`, `domain`, `path`, `sameSite`, `secure`, `maxAge` |
| `janusErrors(options?)` | the plugin: janus's refusals answered |
| `JanusErrorsOptions` | its options: `report`, called with every error answered 5xx |
| `permission(…)`, `byParam(…)` | the guard |
| `PermissionOptions` | its options: `subject`, `ctx` |
| `bodyOf`, `statusOf` | a refusal's body and status |
| `UnauthenticatedBody`, `JanusErrorBody`, `PermissionRefusedBody` | their types |
| `Auth`, `UserOfAuth`, `ObjectData`, `Awaitable` | the part of `janus()` this package calls, the users it knows, an object as the application loads it, a value or its promise |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/janus/docs): a page per area — sessions, signing in and out with the session and device cookies, janus's errors and their statuses, and the permission guard.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/janus/docs/troubleshooting.md): an error message, or a request anonymous, refused or a 404 when it should not be, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/janus/docs/roadmap.md): what is coming, and what is not planned.
