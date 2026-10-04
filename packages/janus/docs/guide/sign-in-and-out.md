# Signing in and out

This page covers `ctx.auth`, the request's half of signing in and out —
`send` after a sign-up or a sign-in, `signOut`, and `device`, the device
cookie that tells `janus()` a sign-in comes from a device it has seen
before — and the unbound functions for code outside a route.

```ts
import { alxia, validate } from '@alxia/core';
import { janusErrors, session } from '@alxia/janus';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';

const accounts = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
});

const SignUp = z.object({ email: z.string(), name: z.string(), password: z.string() });
const SignIn = z.object({ email: z.string(), password: z.string() });

const app = alxia()
	.use(janusErrors()) // a refused sign-in answered 401, a login taken 409
	.use(session(accounts)) // not required: the people signing in are anonymous
	.post('/signup', validate({ body: SignUp }), async ({ body, auth, reply }) => {
		const signedUp = await accounts.signUp(body);
		return reply.created({ id: auth.send(signedUp).id });
	})
	.post('/signin', validate({ body: SignIn }), async ({ body, auth, reply }) => {
		const signedIn = await accounts.signIn(body);
		return reply.ok({ id: auth.send(signedIn).id });
	})
	.post('/signout', async ({ auth, reply }) => reply.ok(await auth.signOut()));
```

**The sign-in itself stays on your `janus()` instance**: `accounts.signIn`,
`accounts.signUp`, `accounts.patient.signIn` for a user type, a sign-in by code or
by link — each flow has its own arguments, so the context does not wrap
them. `ctx.auth` does what comes after: the cookies.

**Behind a `session()` that is not required.** `ctx.auth` exists only on
routes declared after `session()`, and behind `required: true` an
anonymous request — anyone signing in — is answered 401 before the route
runs. [Sessions](sessions.md#where-the-sign-in-routes-go) shows the layout
with a required group after the sign-in routes.

## `ctx.auth.send(signedIn)`

Appends the session cookie to the response — `accounts.cookie.serialize(token,
session)` — and returns `signedIn.user`. **The token goes in the cookie,
never in the body**: answer the fields of the user a client needs.

```text
Set-Cookie: janus-session=yA_6A8zn…; Expires=Fri, 09 Oct 2026 03:50:45 GMT; Path=/; HttpOnly; SameSite=Lax; Secure
```

It takes a `SessionOpened` — anything holding a `token`, a `session` and
a `user`, what `signUp`, `signIn` and the other flows of `janus()` that open
a session answer — so it works after a sign-in by code, by link, or after
a second factor is confirmed too. With a `deviceToken`, it sets the device
cookie as well, with the plugin's `device` options ([below](#devices)).

The cookie's attributes — `name` (`janus-session`), `domain`, `path`
(`'/'`), `sameSite` (`'lax'`), `secure` (`true`) — are set once, in
`janus({ cookie })`, and `session()` reads and renews the same cookie. A
route that sends a session keeps its own `Set-Cookie`: the plugin never
overwrites it with the session the request came in with.

### A user type

With several user types, the flow is the type's; `ctx.auth.send` is the
same:

```ts
import { alxia, validate } from '@alxia/core';
import { janusErrors, session } from '@alxia/janus';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';

const accounts = janus({
	users: {
		patient: { schema: z.object({ email: z.email(), name: z.string() }), password: { login: 'email' } },
		staff: { schema: z.object({ username: z.string() }), password: { login: 'username' } },
	},
	store: createMemoryStores(),
	hasher: scryptHasher(),
});

const SignIn = z.object({ email: z.string(), password: z.string() });

const app = alxia()
	.use(janusErrors())
	.use(session(accounts))
	.post('/patients/signin', validate({ body: SignIn }), async ({ body, auth, reply }) => {
		const signedIn = await accounts.patient.signIn(body);
		return reply.ok({ id: auth.send(signedIn).id });
	});
```

### A second factor

With `janus({ secondFactor })`, `signIn` answers either a session or a
challenge, and `send` refuses the union at compile time
([troubleshooting](../troubleshooting.md#type-secondfactorrequired-is-missing-the-following-properties-from-type-sessionopeneduser-token-session-user)).
Switch on `status` first:

```ts
.post('/signin', { body: SignIn }, async ({ body, auth, reply }) => {
	const result = await accounts.signIn(body);
	if (result.status === 'secondFactor') {
		return reply.ok({ status: result.status, challenge: result.challenge });
	}
	return reply.ok({ status: result.status, id: auth.send(result).id });
})
```

The challenge is a secret like a session token; `@nxgt/janus`'s
second-factor guide says where to keep it and how to confirm it.

## `ctx.auth.signOut()`

Revokes the session the request presents — cookie, bearer or
`X-Session-Token` — and clears the session cookie, **whatever the answer**,
so a browser holding a stale cookie drops it too. It resolves to `true`
when a session was revoked, `false` when the request presented none or an
unknown one.

```ts
const out = await app.request('/signout', { method: 'POST', headers: { cookie: `janus-session=${token}` } });
await out.json();             // true
out.headers.getSetCookie();   // ['janus-session=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; Path=/; HttpOnly; SameSite=Lax; Secure']

const again = await app.request('/signout', { method: 'POST' });
await again.json();           // false, and the cookie is cleared all the same
```

Behind `session(accounts)`, an anonymous request gets that `false`; behind
`session(accounts, { required: true })`, it gets a 401 instead. Signing out of
every device is `accounts.signOutEverywhere(user)`, `@nxgt/janus`'s.

A store that cannot answer makes it throw `STORE_FAILED`, a 503 through
[`janusErrors()`](errors.md); the cookie is not cleared then.

## Devices

`janus({ devices })` tells a user when their account signs in from a
device it had not signed in from. The device is a **device token** the
client keeps in a long-lived cookie and presents at its next sign-in.
`ctx.auth.device` reads it, `ctx.auth.send` writes it back:

```ts
import { alxia, validate } from '@alxia/core';
import { janusErrors, session } from '@alxia/janus';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';

const accounts = janus({
	user: z.object({ email: z.email() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
	devices: { keys: [{ id: '2026-09', key: Bun.env['DEVICES_KEY'] ?? '' }] }, // openssl rand -base64 32
});

const SignIn = z.object({ email: z.string(), password: z.string() });

const app = alxia()
	.use(janusErrors())
	.use(session(accounts))
	.post('/signin', validate({ body: SignIn }), async ({ body, auth, reply }) => {
		const signedIn = await accounts.signIn(body, { device: auth.device });
		return reply.ok({
			id: auth.send(signedIn).id,
			newDevice: signedIn.newDevice, // true for a browser with no device cookie
		});
	});
```

A first sign-in sends two cookies; the next one, presenting the device
cookie, answers `newDevice: false` and sets the device cookie again so it
lasts another `maxAge`:

```text
Set-Cookie: janus-session=5f1I36hr…; Expires=…; Path=/; HttpOnly; SameSite=Lax; Secure
Set-Cookie: janus-device=d1.2026-09.By5A2egs…; Path=/; Max-Age=34560000; Secure; HttpOnly; SameSite=Lax
```

**Only with `devices`.** `ctx.auth.device` is `null` for a browser with no
device cookie, and `janus()` treats `{ device: null }` as a device given:
without `devices`, every such sign-in throws a `TypeError`, a 500
([troubleshooting](../troubleshooting.md#typeerror-signin-a-device-was-given-but-janus-has-no-devices--pass-devices--keys-)).
Leave `device` out when `janus()` has no `devices`.

### Another device cookie

`session(accounts, { device })` names the cookie both `ctx.auth.device` reads
and `ctx.auth.send` sets, so they always agree:

```ts
const device = { name: 'shop-device', domain: 'example.com' };

alxia()
	.use(session(accounts, { device }))
	.post('/signin', validate({ body: SignIn }), async ({ body, auth, reply }) => {
		const signedIn = await accounts.signIn(body, { device: auth.device });
		return reply.ok({ id: auth.send(signedIn).id });
	});
```

### `DeviceCookieOptions`

Given to `session(accounts, { device })`, to `sendSession` as
`{ device: { … } }`, or to `sendDevice`:

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `name` | `string` | `'janus-device'` (`DEVICE_COOKIE`) | the cookie's name, read and set |
| `domain` | `string` | none: the host that set it | the cookie's `Domain` |
| `path` | `string` | `'/'` | the cookie's `Path` |
| `sameSite` | `'lax' \| 'strict' \| 'none'` | `'lax'` | the cookie's `SameSite` |
| `secure` | `boolean` | `true` | the cookie's `Secure` |
| `maxAge` | `number`, seconds | `34_560_000` (400 days, the most a browser keeps) | the cookie's `Max-Age` |

The cookie is always `HttpOnly`. `DEVICE_COOKIE` is `'janus-device'`, the
name `@nxgt/janus-hono` uses, so a device one of them remembers, the other
does too:

```ts
import { DEVICE_COOKIE } from '@alxia/janus';

DEVICE_COOKIE; // 'janus-device'
```

## Outside a route: `sendSession`, `signOut`, `deviceOf`

`ctx.auth` is these functions bound to the request. Unbound, they take the
context and the `janus()` instance, for code that has no `ctx.auth`: a
helper shared by several routes, a test, or a route declared **before**
any `session()`, which then looks up no session at all:

```ts
import { alxia, validate } from '@alxia/core';
import { deviceOf, janusErrors, sendSession, session, signOut } from '@alxia/janus';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';

const accounts = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
	devices: { keys: [{ id: '2026-09', key: Bun.env['DEVICES_KEY'] ?? '' }] },
});

const SignIn = z.object({ email: z.string(), password: z.string() });

const app = alxia()
	.use(janusErrors())
	.post('/signin', validate({ body: SignIn }), async (ctx) => {
		const signedIn = await accounts.signIn(ctx.body, { device: deviceOf(ctx) });
		return ctx.reply.ok({ id: sendSession(ctx, accounts, signedIn).id });
	})
	.post('/signout', async (ctx) => ctx.reply.ok(await signOut(ctx, accounts)))
	.use(session(accounts, { required: true }))
	.get('/me', ({ user, reply }) => reply.ok({ name: user.name }));
```

They behave as `ctx.auth.send`, `ctx.auth.signOut` and `ctx.auth.device`
above. With a device cookie of another name, pass the same options to both
ends: `deviceOf(ctx, device)` and `sendSession(ctx, accounts, signedIn, { device })`.

### `deviceOf(ctx, options?)`

```ts
function deviceOf(ctx: { readonly request: Request }, options?: { readonly name?: string }): string | null;
```

The device cookie's value, or `null` when the request has none or an empty
one. `options.name` reads a cookie of another name.

### `sendDevice(ctx, token, options?)`

```ts
function sendDevice(ctx: { readonly set: ResponseSettings }, token: string, options?: DeviceCookieOptions): void;
```

Sets the device cookie through `ctx.set.cookies`. `send` and `sendSession`
call it when `signedIn.deviceToken` is a string; call it yourself only for
a flow that answers a device token without a session.

## Signatures

```ts
/** auth, on every route after session(). */
interface RequestAuth {
	/** The device token the request carries, for signIn(…, { device }): null when none. */
	readonly device: string | null;
	/** Sends the session cookie — and the device cookie, with a deviceToken — and answers the user. */
	send<U>(signedIn: SessionOpened<U>): U;
	/** Revokes the request's session and clears its cookie. */
	signOut(): Promise<boolean>;
}

/** The part of @nxgt/janus's SignedIn — or of signUp's answer — that opens a session. */
interface SessionOpened<U> extends Pick<SignedIn<U>, 'token' | 'session' | 'user'> {
	readonly deviceToken?: string | null;
}

function sendSession<U>(
	ctx: { readonly set: ResponseSettings },
	auth: Pick<Auth<{ readonly type: string }>, 'cookie'>,
	signedIn: SessionOpened<U>,
	options?: SendSessionOptions,
): U;

interface SendSessionOptions {
	readonly device?: DeviceCookieOptions;
}

function signOut(
	ctx: { readonly request: Request; readonly set: ResponseSettings },
	auth: Pick<Auth<{ readonly type: string }>, 'signOut' | 'cookie'>,
): Promise<boolean>;

interface DeviceCookieOptions {
	readonly name?: string;
	readonly domain?: string;
	readonly path?: string;
	readonly sameSite?: 'lax' | 'strict' | 'none';
	readonly secure?: boolean;
	readonly maxAge?: number;
}

const DEVICE_COOKIE = 'janus-device';
```

`ResponseSettings` is `@alxia/core`'s, `Session` is `@nxgt/janus`'s;
`Auth` is described in [Sessions](sessions.md#signature).
