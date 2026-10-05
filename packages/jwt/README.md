# @alxia/jwt

JSON Web Tokens for [alxia](https://www.npmjs.com/package/@alxia/core), on
Web Crypto, with no dependency: HS256/384/512 with a secret, ES256/384,
RS256/384/512 and EdDSA with a key pair, and a typed bearer guard, a middleware.

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
	.use(bearer({ jwt, schema: z.object({ sub: z.string(), role: z.enum(['admin', 'user']) }) }))
	.get('/me', ({ user, reply }) => reply(200, user));    // user: { sub: string; role: ... }
```

Every request the guard runs on needs a valid token — `Authorization: Bearer`,
or the cookie named by `cookie` — and reads its claims, checked by `schema`
(any Standard Schema), as `user`. Otherwise a 401 with `WWW-Authenticate:
Bearer` and `{ error: 'unauthorized', reason }`. Given to `app.use`, it also
refuses a request no route matches, before its 404: an anonymous request to a
missing path gets the 401. Put the guard in a `group` to guard only some routes.

## API

| export | |
| --- | --- |
| `createJwt(options)` | `sign(claims, { expiresIn? })`, `verify(token)` |
| `JwtOptions` | its options: `algorithm` with `secret`, or with `privateKey` and `publicKey`; `issuer`, `audience`, `expiresIn`, `clockTolerance` |
| `bearer({ jwt, schema?, cookie? })` | the guard: a middleware that gives `user`, or answers the 401 |
| `BearerOptions` | its options: `jwt`, `schema`, `cookie` |
| `base64url(bytes)` | bytes as base64url |
| `Bearer`, `Jwt`, `JwtClaims`, `VerifyResult`, `UnauthorizedBody`, `UnauthorizedProblem`, `Algorithm`, `HmacAlgorithm`, `KeyAlgorithm` | its types; `UnauthorizedProblem` is the 401 under `@alxia/core`'s `alxia({ errors: 'problem' })`, an RFC 9457 problem with `reason` and `issues` |

## Documentation

- [Guide](https://github.com/softistx/alxia/tree/develop/packages/jwt/docs): a page per area — signing and verifying, algorithms and keys, and the bearer guard.
- [Troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/jwt/docs/troubleshooting.md): an error message, and what to do about it.
- [Roadmap](https://github.com/softistx/alxia/blob/develop/packages/jwt/docs/roadmap.md): what is coming, and what is not planned.
- [Recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md): [Authenticate requests](https://github.com/softistx/alxia/blob/develop/docs/recipes/authentication.md), [A GraphQL API](https://github.com/softistx/alxia/blob/develop/docs/recipes/graphql-api.md).
