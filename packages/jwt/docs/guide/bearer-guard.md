# The bearer guard

This page covers `bearer`: a plugin that makes every route declared after
it require a valid token, reads the token's claims as a typed `user`, and
answers a typed 401 otherwise.

```ts
import { alxia } from '@alxia/core';
import { bearer, createJwt } from '@alxia/jwt';

const jwt = createJwt({ secret: Bun.env['JWT_SECRET']!, expiresIn: 3600 });

const app = alxia()
	.get('/health', ({ reply }) => reply(200, 'ok'))        // open: declared before the guard
	.use(bearer({ jwt }))
	.get('/me', ({ user, reply }) => reply(200, { sub: user.sub ?? null })); // user: JwtClaims

app.listen(3000);
```

```sh
curl localhost:3000/me -H "authorization: Bearer $TOKEN"
```

## `bearer`

```ts
function bearer<Schema extends StandardSchemaV1 | undefined = undefined>(
	options: BearerOptions<Schema>,
): Alxia<{ user: User<Schema> }, Empty, '', Reply<401, UnauthorizedBody>>;
// User<Schema>: the schema's output, or JwtClaims without one

interface BearerOptions<Schema extends StandardSchemaV1 | undefined> {
	readonly jwt: Jwt;
	readonly schema?: Schema;
	readonly cookie?: string;
}
```

`bearer` returns an app, given to `use`. Like any route hook, it applies to
the routes declared **after** `use`, in the same app or
[group](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/groups-and-plugins.md);
a route declared before it is open, and cannot read `user`.

### Options

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `jwt` | `Jwt` | — | Verifies the token: what [`createJwt`](tokens.md) returns, or any object with the same `verify`. |
| `schema` | any Standard Schema | none | Checks the claims; `user` is its output. Without it, `user` is `JwtClaims`. |
| `cookie` | `string` | none | A cookie to read the token from when no `Authorization: Bearer` header carries one. |

## Where the token is read

1. The `Authorization` header, as `Bearer <token>`. The scheme is
   case-insensitive (`bearer` works); another scheme, such as `Basic`, is
   ignored as if there were no header.
2. Otherwise, when `cookie` is set, the cookie of that name.
3. Otherwise, a 401 with `reason: 'missing'`.

The header wins: a request with a `Bearer` header and a cookie is judged
on the header alone, even if the header's token is bad and the cookie's
good.

```ts
app.use(bearer({ jwt, cookie: 'token' }));
// Authorization: Bearer <token>      → the header's token
// Cookie: token=<token>              → the cookie's token
// Authorization: Basic …, + cookie   → the cookie's token
// neither                            → 401 missing
```

## Typing `user` with a schema

Without a schema, `user` is the token's `JwtClaims`: `sub` is
`string | undefined`, and a custom claim is `unknown`. With one, `user` is
the schema's output, and a token whose claims it refuses is a 401 with
`reason: 'claims'` and the issues.

```ts
import { z } from 'zod';

const Claims = z.object({ sub: z.string(), role: z.enum(['admin', 'user']) });

const app = alxia()
	.use(bearer({ jwt, schema: Claims }))
	.get('/me', ({ user, reply }) => reply(200, user)); // user: { sub: string; role: 'admin' | 'user' }
```

Any [Standard Schema](https://standardschema.dev) works — Zod, Valibot,
ArkType. `user` is the schema's *output*: a Zod object strips what it does
not declare, so `user.exp` and `user.iat` are gone unless the schema names
them.

## The 401

Every refusal is a `401` with a `WWW-Authenticate: Bearer` header and this
body:

```ts
interface UnauthorizedBody {
	readonly error: 'unauthorized';
	readonly reason:
		| 'missing'                                   // no token found
		| 'malformed' | 'algorithm' | 'signature'     // from verify
		| 'expired' | 'not_yet_valid' | 'issuer' | 'audience'
		| 'claims';                                   // refused by the schema
	readonly issues?: readonly ValidationIssue[];   // with 'claims' only
}
```

```text
401 {"error":"unauthorized","reason":"expired"}
401 {"error":"unauthorized","reason":"claims","issues":[{"target":"headers","path":["role"],"code":"invalid_value","message":"Invalid option: expected one of \"admin\"|\"user\""}]}
```

The `verify` reasons are explained on [Signing and verifying](tokens.md#verify),
and each one, with its fix, in [Troubleshooting](../troubleshooting.md#responses).
The 401 is part of the type of every route after the guard, so a typed
client reads it:

```ts
import { client } from '@alxia/client';

const result = await client(app).get('/me');
if (result.status === 401) result.data.reason; // 'missing' | 'expired' | … | 'claims'
if (result.status === 200) result.data.role;   // 'admin' | 'user'
```

With `claims`, each issue's `path` names the claim and its `target` where
the token was read: `headers` for `Authorization: Bearer`, `cookies` for the
cookie named by `cookie`.

`verify` resolves for any token, whatever its content, so a request to a
guarded route is either let through or answered this 401 — never a 500. A
key that does not fit the algorithm is refused earlier, by `createJwt`, at
startup ([Algorithms and keys](algorithms-and-keys.md#a-key-pair)).

## Roles after the guard

The guard answers *who*; a `derive` after it answers *may they*. It reads
the typed `user`, and its reply joins the type of the routes after it:

```ts
const app = alxia()
	.use(bearer({ jwt, schema: Claims }))
	.get('/me', ({ user, reply }) => reply(200, user))
	.derive(({ user, reply }) => (user.role === 'admin' ? undefined : reply(403, { error: 'forbidden' as const })))
	.get('/admin/stats', ({ reply }) => reply(200, { users: 42 })); // 200, 401 or 403
```

To guard only some routes, put the guard in a group: its hooks stay inside
([Groups and plugins](https://github.com/softistx/alxia/blob/develop/packages/core/docs/guide/groups-and-plugins.md)).

## A login that sets the cookie

The realistic case for a browser: the login route signs a token into an
`httpOnly` cookie, and the guard reads it back from there — or from a
header, for a script.

```ts
import { alxia, validate } from '@alxia/core';
import { bearer, createJwt } from '@alxia/jwt';
import { z } from 'zod';

export const jwt = createJwt({ secret: Bun.env['JWT_SECRET']!, issuer: 'api', expiresIn: 3600 });
const Claims = z.object({ sub: z.string(), role: z.enum(['admin', 'user']) });

export const app = alxia()
	.post('/login', validate({ body: z.object({ user: z.string(), password: z.string() }) }), async ({ body, set, reply }) => {
		const user = await findUser(body.user, body.password); // yours
		if (user === undefined) return reply(401, { error: 'invalid_credentials' as const });
		set.cookies.set('token', await jwt.sign({ sub: user.id, role: user.role }), {
			httpOnly: true,
			secure: true,
			sameSite: 'lax',
			path: '/',
			maxAge: 3600, // the same lifetime as expiresIn
		});
		return reply(204);
	})
	.post('/logout', ({ set, reply }) => {
		set.cookies.delete('token');
		return reply(204);
	})
	.use(bearer({ jwt, schema: Claims, cookie: 'token' }))
	.get('/me', ({ user, reply }) => reply(200, user));
```

Logging out deletes the cookie; it does not revoke the token, which stays
valid until `exp` for whoever copied it. A cookie sent by the browser on
its own needs your CSRF defence on routes that change state — `sameSite`
is a start.

## Testing a guarded route

Sign a token with the same `jwt` and call the app in process — no server,
no network:

```ts
import { expect, test } from 'bun:test';
import { client } from '@alxia/client';
import { app, jwt } from './app';

test('/me needs a token', async () => {
	const missing = await client(app).get('/me');
	expect(missing.status).toBe(401);
	if (missing.status === 401) expect(missing.data.reason).toBe('missing');
	expect(missing.response.headers.get('www-authenticate')).toBe('Bearer');

	const token = await jwt.sign({ sub: 'ada', role: 'admin' });
	const me = await client(app).get('/me', { init: { headers: { authorization: `Bearer ${token}` } } });
	expect(me.status).toBe(200);
});

test('a refused claim', async () => {
	const token = await jwt.sign({ sub: 'ada', role: 'root' });
	const response = await app.request('/me', { headers: { authorization: `Bearer ${token}` } });
	expect(await response.json()).toMatchObject({ error: 'unauthorized', reason: 'claims' });
});
```

## See also

- [Signing and verifying](tokens.md): the `jwt` the guard is given.
- [Algorithms and keys](algorithms-and-keys.md): a guard that verifies with a public key, or across a key rotation.
- [Troubleshooting](../troubleshooting.md): each 401 `reason`, and the type errors around `user`.
