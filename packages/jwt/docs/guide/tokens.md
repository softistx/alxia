# Signing and verifying

This page covers `createJwt`: the options that decide what a token carries
and what `verify` accepts, what `sign` puts in a token, and every reason
`verify` can refuse one.

```ts
import { createJwt } from '@alxia/jwt';

const jwt = createJwt({ secret: Bun.env['JWT_SECRET']!, issuer: 'api', audience: 'web', expiresIn: 3600 });

const token = await jwt.sign({ sub: 'ada', role: 'admin' });

const result = await jwt.verify(token);
if (result.ok) console.log(result.claims.sub); // 'ada'
else console.log(result.reason);              // why it was refused
```

The same object signs and verifies. It is built once, at startup, and
shared: `createJwt` checks the options then, so a bad secret fails the app
before the first request.

## `createJwt`

```ts
function createJwt(options: JwtOptions): Jwt;

interface Jwt {
	readonly algorithm: Algorithm;
	sign(claims: JwtClaims, options?: { readonly expiresIn?: number }): Promise<string>;
	verify(token: string): Promise<VerifyResult>;
}
```

### Options

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `algorithm` | `'HS256' \| 'HS384' \| 'HS512'` with `secret`; `'ES256' \| 'ES384' \| 'RS256' \| 'RS384' \| 'RS512' \| 'EdDSA'` with keys | `'HS256'` | The only algorithm signed and accepted. A key algorithm must be named. |
| `secret` | `string \| Uint8Array` | — | The HMAC secret, at least 32 bytes. Strings are read as UTF-8. |
| `privateKey` | `CryptoKey` | — | Signs. Leave it out on a service that only verifies. |
| `publicKey` | `CryptoKey` | — | Verifies. Required with a key algorithm. |
| `issuer` | `string` | none | Set as `iss` on sign; on verify, `iss` must equal it. |
| `audience` | `string` | none | Set as `aud` on sign; on verify, `aud` must be it or an array holding it. |
| `expiresIn` | `number` (seconds) | none | Sets `exp` to now + this on sign. Without it, tokens never expire. |
| `clockTolerance` | `number` (seconds) | `5` | Skew allowed when checking `exp` and `nbf`. |

`secret` and the key options are exclusive, and the types hold you to it:
an HMAC algorithm takes a `secret`, a key algorithm takes a `publicKey`
and, to sign, a `privateKey`. Choosing between them, and loading keys, is
on [Algorithms and keys](algorithms-and-keys.md).

```ts
type JwtOptions = Common & (
	| { readonly algorithm?: HmacAlgorithm; readonly secret: string | Uint8Array }
	| { readonly algorithm: KeyAlgorithm; readonly privateKey?: CryptoKey; readonly publicKey: CryptoKey }
);
```

## `sign`

```ts
sign(claims: JwtClaims, options?: { readonly expiresIn?: number }): Promise<string>;
```

Resolves to a compact token, `header.payload.signature`. The header is
`{ "alg": <algorithm>, "typ": "JWT" }`. The payload is built in this order,
each step overriding the one before:

1. `iat`: now, in seconds;
2. `iss` from `issuer`, `aud` from `audience`, `exp` from `expiresIn`, when set;
3. the `claims` you pass.

So a claim you pass wins over the options:

```ts
const jwt = createJwt({ secret: Bun.env['JWT_SECRET']!, expiresIn: 3600 });

await jwt.sign({ sub: 'ada' });                       // exp: now + 3600
await jwt.sign({ sub: 'ada' }, { expiresIn: 60 });    // exp: now + 60, for this token only
await jwt.sign({ sub: 'ada', exp: endOfSession });    // exp: endOfSession
await jwt.sign({ sub: 'ada', nbf: startsAt });        // not valid before startsAt
```

`sign` sets no `nbf` and no `jti`; pass them as claims when you need them.
The claims must be JSON: a `Date` becomes a string, not a number of seconds.

`sign` rejects with `TypeError: Signing needs a private key` on a verifier
built without `privateKey` ([Troubleshooting](../troubleshooting.md#typeerror-signing-needs-a-private-key)).

### Claims

```ts
interface JwtClaims {
	readonly iss?: string;
	readonly sub?: string;
	readonly aud?: string | readonly string[];
	readonly exp?: number;
	readonly nbf?: number;
	readonly iat?: number;
	readonly jti?: string;
	readonly [claim: string]: unknown;
}
```

The registered claims are typed; any other is `unknown`. A token's payload
is readable by anyone who holds it — it is signed, not encrypted — so put
an id in it, not an email address or a permission list you would not
publish.

## `verify`

```ts no-check
verify(token: string): Promise<VerifyResult>;

type VerifyResult =
	| { readonly ok: true; readonly claims: JwtClaims }
	| {
			readonly ok: false;
			readonly reason: 'malformed' | 'algorithm' | 'signature' | 'expired' | 'not_yet_valid' | 'issuer' | 'audience';
	  };
```

`verify` does not throw, whatever the token holds: it resolves to a result. It checks,
in this order, and stops at the first failure:

| `reason` | The token… |
| --- | --- |
| `malformed` | is not three base64url parts, or its header or payload is not JSON, or its header is not an object (`null`, an array, a number, a string or a boolean), or its payload is not an object |
| `algorithm` | names another `alg` than the one configured — `none` included |
| `signature` | was not signed by this secret or key, or was altered, or its signature is not one the key could produce (the wrong length) |
| `expired` | has an `exp` at or before now − `clockTolerance` |
| `not_yet_valid` | has an `nbf` after now + `clockTolerance` |
| `issuer` | has an `iss` other than `issuer` (only when `issuer` is set) |
| `audience` | has no `aud`, or one that does not name `audience` (only when `audience` is set) |

The algorithm comes from the options, never from the token, so a token
cannot pick a weaker algorithm or `none`. A verifier without `issuer` or
`audience` does not check them: set both when several services share a
secret or a key.

```ts
import { expect, test } from 'bun:test';
import { createJwt } from '@alxia/jwt';

test('verify refuses what it should', async () => {
	const jwt = createJwt({ secret: 'a-secret-of-at-least-thirty-two-bytes!', issuer: 'api', audience: 'web' });
	const now = Math.floor(Date.now() / 1000);

	expect(await jwt.verify('not-a-token')).toEqual({ ok: false, reason: 'malformed' });
	expect(await jwt.verify(await jwt.sign({ exp: now - 60 }))).toEqual({ ok: false, reason: 'expired' });
	expect(await jwt.verify(await jwt.sign({ nbf: now + 60 }))).toEqual({ ok: false, reason: 'not_yet_valid' });
	expect(await jwt.verify(await jwt.sign({ iss: 'someone-else' }))).toEqual({ ok: false, reason: 'issuer' });
	expect(await jwt.verify(await jwt.sign({ aud: 'mobile' }))).toEqual({ ok: false, reason: 'audience' });
	expect((await jwt.verify(await jwt.sign({ aud: ['web', 'mobile'] }))).ok).toBe(true);
});
```

### Reading claims

Narrow on `ok` first; `claims` exists only on success. A registered claim
is typed, any other is `unknown` and read by index:

```ts
const result = await jwt.verify(token);
if (!result.ok) throw new Error(result.reason);

result.claims.sub;      // string | undefined
result.claims['role'];  // unknown
```

To read custom claims as typed values, check them with a schema:

```ts
import { z } from 'zod';

const Claims = z.object({ sub: z.string(), role: z.enum(['admin', 'user']) });

const claims = Claims.parse(result.claims); // { sub: string; role: 'admin' | 'user' }
```

Behind an HTTP route, [the bearer guard](bearer-guard.md) does both — the
verification and the schema — and answers a 401 itself.

## A login route

The realistic case: a route that checks credentials and answers a token,
which the client then sends as `Authorization: Bearer <token>`.

```ts
import { alxia, validate } from '@alxia/core';
import { createJwt } from '@alxia/jwt';
import { z } from 'zod';

const jwt = createJwt({ secret: Bun.env['JWT_SECRET']!, issuer: 'api', expiresIn: 15 * 60 });

const app = alxia().post(
	'/login',
	validate({ body: z.object({ user: z.string(), password: z.string() }) }),
	async ({ body, reply }) => {
		const user = await findUser(body.user, body.password); // yours
		if (user === undefined) return reply(401, { error: 'invalid_credentials' as const });
		return reply(200, { token: await jwt.sign({ sub: user.id, role: user.role }) });
	},
);
```

A short `expiresIn` limits what a stolen token is worth: there is no
revocation list, so a signed token is valid until it expires. To answer
it from a cookie instead, see [the bearer guard](bearer-guard.md#a-login-that-sets-the-cookie).

## `base64url`

```ts
function base64url(bytes: Uint8Array): string;
```

Bytes as unpadded base64url, the encoding of every part of a token. Use it
to print a generated secret ([Algorithms and keys](algorithms-and-keys.md#a-secret)).

## See also

- [Algorithms and keys](algorithms-and-keys.md): secrets, key pairs, PEM and JWK, rotation.
- [The bearer guard](bearer-guard.md): verifying the token on every request to a route.
- [Troubleshooting](../troubleshooting.md): each error and each `reason`, with its fix.
