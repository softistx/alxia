# @alxia/jwt

JSON Web Tokens for [alxia](https://www.npmjs.com/package/@alxia/core), on
Web Crypto, with no dependency: HS256/384/512 with a secret, ES256/384,
RS256/384/512 and EdDSA with a key pair, and a typed bearer guard.

```sh
bun add @alxia/jwt @alxia/core
bun add -d typescript
```

## Tokens

```ts
import { createJwt } from '@alxia/jwt';

const jwt = createJwt({ secret: Bun.env.JWT_SECRET!, issuer: 'api', audience: 'web', expiresIn: 3600 });
const token = await jwt.sign({ sub: user.id, role: 'admin' });

const result = await jwt.verify(token);
if (result.ok) result.claims.sub;
else result.reason; // 'malformed' | 'algorithm' | 'signature' | 'expired' | 'not_yet_valid' | 'issuer' | 'audience'
```

The algorithm is fixed by the options, never read from the token: `alg:
none` and algorithm confusion are refused. A secret holds at least 32 bytes.
With a key pair, a verifier needs only the public key, and `createJwt`
refuses at once a key that does not fit the algorithm (a P-384 key under
`ES256`), so a wrong key fails at startup.

## A guard

```ts
import { bearer } from '@alxia/jwt';
import { z } from 'zod';

const app = alxia()
	.post('/login', ...)                                    // open
	.plugin(bearer({ jwt, schema: z.object({ sub: z.string(), role: z.enum(['admin', 'user']) }) }))
	.get('/me', ({ user, reply }) => reply(200, user));    // user: { sub: string; role: ... }
```

Every route after the guard needs a valid token — `Authorization: Bearer`,
or the cookie named by `cookie` — and reads its claims, checked by `schema`
(any Standard Schema), as `user`. Otherwise a 401 with `WWW-Authenticate:
Bearer` and `{ error: 'unauthorized', reason }`.

## API

| export | |
| --- | --- |
| `createJwt(options)` | `sign(claims, { expiresIn? })`, `verify(token)` |
| `JwtOptions` | its options: `algorithm` with `secret`, or with `privateKey` and `publicKey`; `issuer`, `audience`, `expiresIn`, `clockTolerance` |
| `bearer({ jwt, schema?, cookie? })` | the guard: an app that derives `user` |
| `BearerOptions` | its options: `jwt`, `schema`, `cookie` |
| `base64url(bytes)` | bytes as base64url |
| `Jwt`, `JwtClaims`, `VerifyResult`, `UnauthorizedBody`, `Algorithm`, `HmacAlgorithm`, `KeyAlgorithm` | its types |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/jwt/docs): a page per area — signing and verifying, algorithms and keys, and the bearer guard.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/jwt/docs/troubleshooting.md): an error message, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/jwt/docs/roadmap.md): what is coming, and what is not planned.
