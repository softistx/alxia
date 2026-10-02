# Signing in and out

This page covers the cookies: `sendSession` after a sign-up or a sign-in,
`signOut`, and the device cookie that tells `janus()` a sign-in comes from
a device it has seen before.

```ts
import { alxia } from '@alxia/core';
import { janusErrors, sendSession, signOut } from '@alxia/janus';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';

const auth = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
});

const SignUp = z.object({ email: z.string(), name: z.string(), password: z.string() });
const SignIn = z.object({ email: z.string(), password: z.string() });

const app = alxia()
	.use(janusErrors()) // a refused sign-in answered 401, a login taken 409
	.post('/signup', { body: SignUp }, async (ctx) => {
		const signedUp = await auth.signUp(ctx.body);
		return ctx.reply(201, { id: sendSession(ctx, auth, signedUp).id });
	})
	.post('/signin', { body: SignIn }, async (ctx) => {
		const signedIn = await auth.signIn(ctx.body);
		return ctx.reply(200, { id: sendSession(ctx, auth, signedIn).id });
	})
	.post('/signout', async (ctx) => ctx.reply(200, await signOut(ctx, auth)));
```

## `sendSession(ctx, auth, signedIn, options?)`

Appends the session cookie to the response — `auth.cookie.serialize(token,
session)` — and returns `signedIn.user`. **The token goes in the cookie,
never in the body**: answer the fields of the user a client needs.

```text
Set-Cookie: janus-session=yA_6A8zn…; Expires=Fri, 09 Oct 2026 03:50:45 GMT; Path=/; HttpOnly; SameSite=Lax; Secure
```

It takes anything holding a `token`, a `session` and a `user` — what
`signUp`, `signIn` and the other flows of `janus()` that open a session
answer — so it works after a sign-in by code, by link, or after a second
factor is confirmed too.

| Argument | Type | Effect |
| --- | --- | --- |
| `ctx` | `{ set: ResponseSettings }` | the route's context; the cookie is added to `ctx.set.headers` |
| `auth` | your `janus()` instance | its `cookie` names and writes the cookie |
| `signedIn` | `{ token, session, user, deviceToken? }` | what the flow answered |
| `options.device` | `DeviceCookieOptions` | the device cookie's options, when `signedIn.deviceToken` is a string ([below](#devices)) |

The cookie's attributes — `name` (`janus-session`), `domain`, `path`
(`'/'`), `sameSite` (`'lax'`), `secure` (`true`) — are set once, in
`janus({ cookie })`, and `session()` reads and renews the same cookie.

### A second factor

With `janus({ secondFactor })`, `signIn` answers either a session or a
challenge, and `sendSession` refuses the union at compile time
([troubleshooting](../troubleshooting.md#type-secondfactorrequired-is-missing-the-following-properties-from-type----token-session-user)).
Switch on `status` first:

```ts
.post('/signin', { body: SignIn }, async (ctx) => {
	const result = await auth.signIn(ctx.body);
	if (result.status === 'secondFactor') {
		return ctx.reply(200, { status: result.status, challenge: result.challenge });
	}
	return ctx.reply(200, { status: result.status, id: sendSession(ctx, auth, result).id });
})
```

The challenge is a secret like a session token; `@nxgt/janus`'s
second-factor guide says where to keep it and how to confirm it.

## `signOut(ctx, auth)`

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

Declare the sign-out route before `session(auth, { required: true })` if
an anonymous request should get a `false` rather than a 401. Signing out
of every device is `auth.signOutEverywhere(user)`, `@nxgt/janus`'s.

A store that cannot answer makes it throw `STORE_FAILED`, a 503 through
[`janusErrors()`](errors.md); the cookie is not cleared then.

## Devices

`janus({ devices })` tells a user when their account signs in from a
device it had not signed in from. The device is a **device token** the
client keeps in a long-lived cookie and presents at its next sign-in.
`deviceOf(ctx)` reads it, `sendSession` writes it back:

```ts
import { alxia } from '@alxia/core';
import { deviceOf, janusErrors, sendSession } from '@alxia/janus';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';

const auth = janus({
	user: z.object({ email: z.email() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
	devices: { keys: [{ id: '2026-09', key: Bun.env['DEVICES_KEY'] ?? '' }] }, // openssl rand -base64 32
});

const SignIn = z.object({ email: z.string(), password: z.string() });

const app = alxia()
	.use(janusErrors())
	.post('/signin', { body: SignIn }, async (ctx) => {
		const signedIn = await auth.signIn(ctx.body, { device: deviceOf(ctx) });
		return ctx.reply(200, {
			id: sendSession(ctx, auth, signedIn).id,
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

**Only with `devices`.** `deviceOf` answers `null` for a browser with no
device cookie, and `janus()` treats `{ device: null }` as a device given:
without `devices`, every such sign-in throws a `TypeError`, a 500
([troubleshooting](../troubleshooting.md#typeerror-signin-a-device-was-given-but-janus-has-no-devices--pass-devices--keys-)).
Leave `device` out when `janus()` has no `devices`.

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

Sets the device cookie through `ctx.set.cookies`. `sendSession` calls it
when `signedIn.deviceToken` is a string; call it yourself only for a flow
that answers a device token without a session.

### `DeviceCookieOptions`

Given to `sendSession` as `{ device: { … } }`, or to `sendDevice`:

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `name` | `string` | `'janus-device'` (`DEVICE_COOKIE`) | the cookie's name; give `deviceOf` the same |
| `domain` | `string` | none: the host that set it | the cookie's `Domain` |
| `path` | `string` | `'/'` | the cookie's `Path` |
| `sameSite` | `'lax' \| 'strict' \| 'none'` | `'lax'` | the cookie's `SameSite` |
| `secure` | `boolean` | `true` | the cookie's `Secure` |
| `maxAge` | `number`, seconds | `34_560_000` (400 days, the most a browser keeps) | the cookie's `Max-Age` |

The cookie is always `HttpOnly`. `DEVICE_COOKIE` is `'janus-device'`, the
name `@nxgt/janus-hono` uses, so a device one of them remembers, the other
does too:

```ts
import { DEVICE_COOKIE, deviceOf, sendSession } from '@alxia/janus';

DEVICE_COOKIE; // 'janus-device'

const device = { name: 'shop-device', domain: 'example.com' };

alxia().post('/signin', { body: SignIn }, async (ctx) => {
	const signedIn = await auth.signIn(ctx.body, { device: deviceOf(ctx, device) });
	return ctx.reply(200, { id: sendSession(ctx, auth, signedIn, { device }).id });
});
```

## Signatures

```ts
function sendSession<U>(
	ctx: { readonly set: ResponseSettings },
	auth: Pick<Auth<{ readonly type: string }>, 'cookie'>,
	signedIn: {
		readonly token: string;
		readonly session: Session;
		readonly user: U;
		readonly deviceToken?: string | null;
	},
	options?: SendSessionOptions,
): U;

interface SendSessionOptions {
	readonly device?: DeviceCookieOptions;
}

function signOut(
	ctx: { readonly request: Request; readonly set: ResponseSettings },
	auth: Pick<Auth<{ readonly type: string }>, 'signOut' | 'cookie'>,
): Promise<boolean>;

const DEVICE_COOKIE = 'janus-device';
```

`ResponseSettings` is `@alxia/core`'s; `Auth` is described in
[Sessions](sessions.md#signature).
