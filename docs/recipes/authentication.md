# Authenticate requests

**The problem.** Some routes are open, some need a signed-in user, and a few
need a particular role. You want the user typed in every handler that needs
one, a 401 before the body is read, and a middleware that reads the app's
context without importing the app.

This recipe does it with a bearer token ([`@alxia/jwt`](../../packages/jwt))
and then with a cookie session ([`@alxia/janus`](../../packages/janus)).

```sh
bun add @alxia/core @alxia/jwt zod
```

## A bearer token

The secret comes from the environment, checked once at startup, and the
token is built once.

```ts
// file: src/jwt.ts
import { createJwt } from '@alxia/jwt';

// A secret holds at least 32 bytes: createJwt refuses a short one at startup.
export const jwt = createJwt({
	secret: Bun.env['JWT_SECRET'] ?? 'a-development-secret-of-32-bytes-or-more',
	expiresIn: 3600,
});
```

The base app holds what every route reads, and is **registered**, so a file
of routes or a middleware reads its context with no import of the app:

```ts
// file: src/context.ts
import { alxia } from '@alxia/core';

export interface Account {
	readonly id: string;
	readonly role: 'admin' | 'user';
	readonly hash: string; // Bun.password
}

// Your database, here a Map.
const users = new Map<string, Account>([
	['ada', { id: 'ada', role: 'admin', hash: await Bun.password.hash('lovelace') }],
]);

export const base = alxia().decorate({ users });

// Register the base, never the app: the app mounts the files that read it.
declare module '@alxia/core' {
	interface Register {
		context: typeof base;
	}
}
```

Sign-in is a route of a file of its own. `defineRoutes()` reads the
registered context, so `users` is typed there, and the app that mounts it
must give it.

```ts
// file: src/login.ts
import { defineRoutes, responds, validate } from '@alxia/core';
import { z } from 'zod';
import { jwt } from './jwt';

const Credentials = z.object({ id: z.string(), password: z.string() });

export const login = defineRoutes().post(
	'/login',
	validate({ body: Credentials }),
	responds({
		200: z.object({ token: z.string() }),
		401: z.object({ error: z.literal('invalid_credentials') }),
	}),
	async ({ body, users, reply }) => {
		const account = users.get(body.id);
		// The same answer for an unknown user and a wrong password.
		if (!account || !(await Bun.password.verify(body.password, account.hash))) {
			return reply(401, { error: 'invalid_credentials' });
		}
		return reply(200, { token: await jwt.sign({ sub: account.id, role: account.role }) });
	},
);
```

The guard turns every request after it into one with a typed `user`, or a
401. A role check is a middleware of its own that **requires** `user`: its
type argument says what it reads beyond the registered context, so a route
without the guard before it does not compile.

```ts
// file: src/auth.ts
import { defineMiddleware } from '@alxia/core';
import { bearer } from '@alxia/jwt';
import { z } from 'zod';
import { jwt } from './jwt';

export const Claims = z.object({ sub: z.string(), role: z.enum(['admin', 'user']) });

// Checks the signature, the expiry and the claims; gives `user: { sub, role }`.
export const authenticated = bearer({ jwt, schema: Claims });

export const requireRole = (role: z.infer<typeof Claims>['role']) =>
	defineMiddleware<{ user: z.infer<typeof Claims> }>()(({ user, reply }, next) =>
		user.role === role ? next() : reply(403, { error: 'forbidden' as const }),
	);
```

```ts
// file: src/app.ts
import { responds } from '@alxia/core';
import { z } from 'zod';
import { authenticated, requireRole } from './auth';
import { base } from './context';
import { login } from './login';

export const app = base
	.plugin(login) // open: declared before the guard
	.use(authenticated) // every route after it needs a valid token
	.get('/me', ({ user, reply }) => reply(200, user)) // user: { sub: string; role: 'admin' | 'user' }
	.get(
		'/admin/stats',
		requireRole('admin'), // a 403 for a signed-in user who is not an admin
		responds({ 200: z.object({ users: z.number() }) }),
		({ users, reply }) => reply(200, { users: users.size }),
	);
```

A request with no valid token never reaches a route, and, because the guard
is given to the app, neither does one to a path no route has: an anonymous
caller learns nothing about which paths exist. Put the guard in a
[group](../../packages/core/docs/guide/groups-and-plugins.md) to guard some
routes only.

```ts
// file: src/app.spec.ts
import { expect, test } from 'bun:test';
import { app } from './app';

async function token(id: string, password: string): Promise<string> {
	const response = await app.request('/login', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ id, password }),
	});
	return ((await response.json()) as { token: string }).token;
}

test('a token opens /me, and the role guards /admin/stats', async () => {
	const authorization = `Bearer ${await token('ada', 'lovelace')}`;
	const me = await app.request('/me', { headers: { authorization } });
	expect(await me.json()).toMatchObject({ sub: 'ada', role: 'admin' });
	const stats = await app.request('/admin/stats', { headers: { authorization } });
	expect(await stats.json()).toEqual({ users: 1 });
});

test('no token is a 401 with WWW-Authenticate, even on a path no route has', async () => {
	const me = await app.request('/me');
	expect(me.status).toBe(401);
	expect(me.headers.get('www-authenticate')).toContain('Bearer');
	expect((await app.request('/nowhere')).status).toBe(401);
});

test('a wrong password is a 401', async () => {
	const response = await app.request('/login', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ id: 'ada', password: 'nope' }),
	});
	expect(response.status).toBe(401);
});
```

## A cookie session with janus

When the browser holds the session, [`@alxia/janus`](../../packages/janus)
keeps the user, the cookie and its renewal. `janusErrors()` answers janus's
refusals (a taken login, a store that is down) with their status and a safe
body, so it goes first; `session()` follows. Sign-in stays on the janus
instance, and `auth.send` sets the cookie.

```sh
bun add @alxia/janus @nxgt/janus
```

```ts
// file: src/session-app.ts
import { alxia, validate } from '@alxia/core';
import { janusErrors, session } from '@alxia/janus';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';

const accounts = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	password: { login: 'email' },
	store: createMemoryStores(), // your database's adapter in production
	hasher: scryptHasher(),
});

const SignIn = z.object({ email: z.string(), password: z.string() });

export const sessionApp = alxia()
	.use(janusErrors(), session(accounts)) // errors first; anonymous may reach sign-in
	.post('/signin', validate({ body: SignIn }), async ({ body, auth, reply }) => {
		const signedIn = await accounts.signIn(body); // throws a JanusError: a 401 by janusErrors()
		return reply.ok({ id: auth.send(signedIn).id }); // the token goes in the cookie, not the body
	})
	.post('/signout', async ({ auth, reply }) => reply.ok(await auth.signOut()))
	.use(session(accounts, { required: true })) // the routes after it, and any unmatched request
	.get('/me', ({ user, reply }) => reply.ok({ name: user.name })); // user: never null

export { accounts };
```

```ts
// file: src/session-app.spec.ts
import { expect, test } from 'bun:test';
import { accounts, sessionApp } from './session-app';

test('sign in sets the cookie, and the cookie opens /me', async () => {
	await accounts.signUp({ email: 'ada@example.com', name: 'Ada', password: 'a long password' });
	const signedIn = await sessionApp.request('/signin', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ email: 'ada@example.com', password: 'a long password' }),
	});
	expect(signedIn.status).toBe(200);
	const cookie = signedIn.headers.getSetCookie()[0]?.split(';')[0] ?? '';
	const me = await sessionApp.request('/me', { headers: { cookie } });
	expect(await me.json()).toEqual({ name: 'Ada' });
	expect((await sessionApp.request('/me')).status).toBe(401);
});
```

## Reference

- [`bearer` and the guard](../../packages/jwt/docs/guide/bearer-guard.md),
  [signing and verifying](../../packages/jwt/docs/guide/tokens.md),
  [algorithms and keys](../../packages/jwt/docs/guide/algorithms-and-keys.md)
- [Sessions](../../packages/janus/docs/guide/sessions.md),
  [signing in and out](../../packages/janus/docs/guide/sign-in-and-out.md),
  [permissions](../../packages/janus/docs/guide/permissions.md),
  [janus's errors](../../packages/janus/docs/guide/errors.md)
- [`Register`, `AppContext` and `defineRoutes`](../../packages/core/docs/guide/types.md#register-and-appcontext),
  [middleware](../../packages/core/docs/guide/middleware.md)
- [Errors as problem details](errors.md), for a 401 in RFC 9457 format
- Troubleshooting: [jwt](../../packages/jwt/docs/troubleshooting.md),
  [janus](../../packages/janus/docs/troubleshooting.md)
