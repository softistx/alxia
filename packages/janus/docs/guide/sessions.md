# Sessions

This page covers `session()`: the plugin that reads who a request belongs
to, hands the routes after it a typed `user` and `session`, refuses an
anonymous request when asked to, and sends a renewed session's cookie
again.

```ts
import { alxia } from '@alxia/core';
import { janusErrors, session } from '@alxia/janus';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';

const auth = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	password: { login: 'email' },
	store: createMemoryStores(), // your database's adapter in production
	hasher: scryptHasher(),
});

const app = alxia()
	.use(janusErrors())
	.get('/health', ({ reply }) => reply(200, 'ok'))       // before it: open
	.use(session(auth, { required: true }))
	.get('/me', ({ user, reply }) => reply(200, { name: user.name })); // user: never null
```

`session(auth)` calls `auth.authenticate(request)` once per request, for
the routes declared **after** it. A route declared before it is not
touched, and has no `user`.

## Where the session is read from

`auth.authenticate` reads, in this order, `Authorization: Bearer <token>`,
`X-Session-Token: <token>`, and the session cookie (`janus-session` unless
`janus({ cookie: { name } })` says otherwise). **The first credential
present wins, not the first valid one**: a request sending a lapsed bearer
beside a live cookie is anonymous.

```ts
await app.request('/me', { headers: { cookie: `janus-session=${token}` } });     // 200
await app.request('/me', { headers: { authorization: `Bearer ${token}` } });     // 200
await app.request('/me', { headers: { 'x-session-token': token } });             // 200
await app.request('/me');                                                        // 401
```

A lapsed or revoked session, a user deleted or made inactive, or a user of
another type than `type` is anonymous.

## Options

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `required` | `boolean` (a literal `true` or `false`) | `false` | `true`: an anonymous request is answered `401 { error: 'unauthenticated' }`, the route never runs, and `user` is never `null` in it |
| `type` | one of the user types of `janus()` | every type | only a user of this type is authenticated; any other is anonymous, and `user` is narrowed to it |

### `required`

Without it, `user` and `session` are `null` for an anonymous request, and
the route decides:

```ts
const app = alxia()
	.use(session(auth))
	.get('/greeting', ({ user, reply }) =>
		reply(200, user === null ? 'Hello, stranger' : `Hello, ${user.name}`),
	);
```

With `required: true`, the 401 is in the type of every route after it, so a
client generated from the app reads it:

```text
401 {"error":"unauthenticated"}
```

Pass a literal. A `boolean` computed at run time matches neither overload,
and is a compile error
([troubleshooting](../troubleshooting.md#type-boolean-is-not-assignable-to-type-true)).
Choose between the two calls instead; the routes then read `user` as
possibly `null`, the looser of the two:

```ts
const strict = Bun.env['STRICT'] === '1';
// session(auth, { required: strict });  // does not compile
const guard = strict ? session(auth, { required: true }) : session(auth);

const app = alxia()
	.use(guard)
	.get('/me', ({ user, reply }) => reply(200, user === null ? 'anonymous' : user.name));
```

### `type`

With several user types, `type` narrows `user` to one of them; a user of
another type is anonymous there. Scope it with `group`:

```ts
import { alxia } from '@alxia/core';
import { janusErrors, session } from '@alxia/janus';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';

const auth = janus({
	users: {
		patient: {
			schema: z.object({ email: z.email(), name: z.string() }),
			password: { login: 'email' },
		},
		staff: {
			schema: z.object({ username: z.string() }),
			password: { login: 'username' },
		},
	},
	store: createMemoryStores(),
	hasher: scryptHasher(),
});

const app = alxia()
	.use(janusErrors())
	.group('/staff', (staff) =>
		staff
			.use(session(auth, { type: 'staff', required: true }))
			.get('/me', ({ user, reply }) => reply(200, { username: user.username })), // a staff user
	)
	.use(session(auth))
	.get('/whoami', ({ user, reply }) =>
		reply(200, user === null ? 'anonymous' : user.type), // 'patient' | 'staff'
	);
```

A patient's session on `/staff/me` is a 401, as if they had sent none. A
`type` that is not one of `janus()`'s user types does not compile.

## What the routes read

| Field | Without `required` | With `required: true` |
| --- | --- | --- |
| `user` | the user, typed by its schema and narrowed by `type`, or `null` | the user |
| `session` | `Session` or `null` | `Session` |

`Session` is `@nxgt/janus`'s: `id`, `userId`, `authenticatedAt`,
`expiresAt`, `revokedAt`, `createdAt`. The token is never in it.

`user` is the whole user as `janus()` answers it — your schema's fields,
plus `id`, `type`, `emailVerified`, `active`, `hasPassword`,
`hasSecondFactor`, `version`, `createdAt`, `updatedAt` — and never a
password hash. Reply with the fields a client needs rather than the whole
object when the user schema holds anything private.

## A renewed session is sent again

A session type with a `renewAfter` slides: `authenticate` renews it in
passing once that much has passed, and its expiry moves. `session()` then
sends the cookie again, after the route, with the new `Expires` — under two
conditions:

- **the request presented the session as a cookie.** A client sending
  `Authorization: Bearer` is never handed a cookie; it keeps its token,
  which is still the same one;
- **the route did not set a session cookie itself.** A route behind the
  plugin that signs in, or signs out, keeps its own `Set-Cookie`: the
  session it replaced does not undo it.

```ts
import { alxia } from '@alxia/core';
import { session } from '@alxia/janus';
import { createMemoryStores, fixedClock, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';

const clock = fixedClock(Date.UTC(2026, 8, 24));
const auth = janus({
	user: z.object({ email: z.email() }),
	password: { login: 'email' },
	session: { lifespan: '7d', renewAfter: '1d' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
	clock,
});
const app = alxia()
	.use(session(auth, { required: true }))
	.get('/me', ({ user, reply }) => reply(200, user.email));

const { token } = await auth.signUp({ email: 'ada@example.com', password: 'correct horse' });
clock.advance(2 * 86_400_000);

const viaCookie = await app.request('/me', { headers: { cookie: `janus-session=${token}` } });
viaCookie.headers.getSetCookie(); // ['janus-session=…; Expires=Sat, 03 Oct 2026 00:00:00 GMT; Path=/; HttpOnly; SameSite=Lax; Secure']

const viaBearer = await app.request('/me', { headers: { authorization: `Bearer ${token}` } });
viaBearer.headers.getSetCookie(); // []
```

The cookie's attributes are `janus()`'s `cookie` option — `name`, `domain`,
`path` (`'/'`), `sameSite` (`'lax'`) and `secure` (`true`). This package
writes it with `auth.cookie.serialize`, so they are set in one place.

## An outage is not anonymous

A store that cannot answer makes `authenticate` throw `STORE_FAILED`.
`session()` does not catch it: the request fails, and `janusErrors()`
answers it **503** `{ "code": "STORE_FAILED" }` — never a 401 that would
send every user to the sign-in page. Without `janusErrors()`, it is the
app's 500. See [Errors](errors.md).

Routes declared before `session()` do not call the store, and keep
answering.

## Testing it

`app.request` calls the app in process; `fixedClock` moves time.

```ts
import { expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { session } from '@alxia/janus';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';

const auth = janus({
	user: z.object({ email: z.email() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher({ cost: 10 }), // fast in tests
});
const app = alxia()
	.use(session(auth, { required: true }))
	.get('/me', ({ user, reply }) => reply(200, { email: user.email }));

test('the session reads the user, and anonymous is a 401', async () => {
	const { token } = await auth.signUp({ email: 'ada@example.com', password: 'correct horse' });
	const me = await app.request('/me', { headers: { authorization: `Bearer ${token}` } });
	expect(await me.json()).toEqual({ email: 'ada@example.com' });
	expect((await app.request('/me')).status).toBe(401);
});
```

## Signature

```ts
function session<A extends Auth<{ readonly type: string }>, const T extends UserOfAuth<A>['type']>(
	auth: A,
	options: SessionOptions<T> & { readonly required: true },
): Alxia<{ readonly user: UserOf<A, T>; readonly session: Session }, Empty, '', Reply<401, UnauthenticatedBody>>;

function session<A extends Auth<{ readonly type: string }>, const T extends UserOfAuth<A>['type']>(
	auth: A,
	options?: SessionOptions<T> & { readonly required?: false },
): Alxia<{ readonly user: UserOf<A, T> | null; readonly session: Session | null }, Empty, '', never>;

interface SessionOptions<T extends string> {
	readonly type?: T;
	readonly required?: boolean;
}

interface UnauthenticatedBody {
	readonly error: 'unauthenticated';
}

/** The part of janus() this package calls: what any janus() instance answers. */
type Auth<U extends { readonly type: string }> = Pick<SharedApi<U>, 'authenticate' | 'signOut' | 'cookie'>;

/** The users an auth instance knows, as a union narrowed by user.type. */
type UserOfAuth<A> = A extends Auth<infer U> ? U : never;
```

`UserOf<A, T>` is `Extract<UserOfAuth<A>, { readonly type: T }>`; it is not
exported. `Alxia`, `Empty` and `Reply` are `@alxia/core`'s; `Session` and
`SharedApi` are `@nxgt/janus`'s.

Next: [Signing in and out](sign-in-and-out.md) sets the cookie this plugin
reads.
