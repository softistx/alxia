# Troubleshooting

Each entry is headed by the text you see: a TypeScript error, an exception
thrown by `createJwt` or `sign` (`verify` never throws), or the body of the guard's 401.
Problems that show no message are under [Traps](#traps), by symptom.

**Types**

- [`'secret' does not exist in type 'Common & { readonly algorithm: KeyAlgorithm; … }'`](#secret-does-not-exist-in-type-common---readonly-algorithm-keyalgorithm--)
- [`'publicKey' does not exist in type 'Common & { readonly algorithm?: HmacAlgorithm; … }'`](#publickey-does-not-exist-in-type-common---readonly-algorithm-hmacalgorithm--)
- [`Argument of type '{ algorithm: "ES256"; privateKey: CryptoKey; }' is not assignable to parameter of type 'JwtOptions'`](#argument-of-type--algorithm-es256-privatekey-cryptokey--is-not-assignable-to-parameter-of-type-jwtoptions)
- [`Property 'claims' does not exist on type 'VerifyResult'`](#property-claims-does-not-exist-on-type-verifyresult)
- [`Property 'role' comes from an index signature, so it must be accessed with ['role']`](#property-role-comes-from-an-index-signature-so-it-must-be-accessed-with-role)
- [`Type 'unknown' is not assignable to type 'string'` on a claim](#type-unknown-is-not-assignable-to-type-string-on-a-claim)
- [`Type 'string | undefined' is not assignable to type 'string'` on `sub`](#type-string--undefined-is-not-assignable-to-type-string-on-sub)
- [`Property 'user' does not exist on type 'Context<…>'`](#property-user-does-not-exist-on-type-context)

**Startup**

- [`TypeError: A JWT secret must hold at least 32 bytes`](#typeerror-a-jwt-secret-must-hold-at-least-32-bytes)
- [`TypeError: createJwt: ES256 needs an ECDSA P-256 key; the publicKey is ECDSA P-384`](#typeerror-createjwt-es256-needs-an-ecdsa-p-256-key-the-publickey-is-ecdsa-p-384)
- [`TypeError: createJwt: the publicKey must be a public key that can verify; it is a private key that can sign`](#typeerror-createjwt-the-publickey-must-be-a-public-key-that-can-verify-it-is-a-private-key-that-can-sign)

**Runtime**

- [`TypeError: Signing needs a private key`](#typeerror-signing-needs-a-private-key)

**Responses**

- [`401 {"error":"unauthorized","reason":"missing"}`](#401-errorunauthorizedreasonmissing)
- [`401 {"error":"unauthorized","reason":"malformed"}`](#401-errorunauthorizedreasonmalformed)
- [`401 {"error":"unauthorized","reason":"algorithm"}`](#401-errorunauthorizedreasonalgorithm)
- [`401 {"error":"unauthorized","reason":"signature"}`](#401-errorunauthorizedreasonsignature)
- [`401 {"error":"unauthorized","reason":"expired"}`](#401-errorunauthorizedreasonexpired)
- [`401 {"error":"unauthorized","reason":"not_yet_valid"}`](#401-errorunauthorizedreasonnot_yet_valid)
- [`401 {"error":"unauthorized","reason":"issuer"}`](#401-errorunauthorizedreasonissuer)
- [`401 {"error":"unauthorized","reason":"audience"}`](#401-errorunauthorizedreasonaudience)
- [`401 {"error":"unauthorized","reason":"claims","issues":[…]}`](#401-errorunauthorizedreasonclaimsissues)

**Traps**

- [A token is still accepted long after it was issued](#a-token-is-still-accepted-long-after-it-was-issued)
- [A token meant for another service is accepted](#a-token-meant-for-another-service-is-accepted)
- [`user` has no `exp` or `iat`](#user-has-no-exp-or-iat)
- [A missing path answers 401, not 404](#a-missing-path-answers-401-not-404)

## Types

These are what `tsc` prints. The options of `createJwt` and the result of
`verify` are unions, and the types refuse a mix the runtime could not use.

### `'secret' does not exist in type 'Common & { readonly algorithm: KeyAlgorithm; … }'`

**When:** `createJwt` is given a key algorithm (`ES256`, `RS256`, `EdDSA`…)
and a `secret`.

```text
error TS2353: Object literal may only specify known properties, and 'secret' does not exist in type 'Common & { readonly algorithm: KeyAlgorithm; readonly privateKey?: CryptoKey; readonly publicKey: CryptoKey; }'.
```

**Why:** a secret signs only with HMAC. ECDSA, RSA and EdDSA sign with a
private key and verify with a public one.

**Fix:** an HMAC algorithm with the secret, or keys with the key algorithm
([Algorithms and keys](guide/algorithms-and-keys.md#which-to-choose)):

```ts
createJwt({ algorithm: 'HS256', secret: Bun.env['JWT_SECRET']! });
createJwt({ algorithm: 'ES256', privateKey, publicKey });
```

### `'publicKey' does not exist in type 'Common & { readonly algorithm?: HmacAlgorithm; … }'`

**When:** `createJwt` is given keys with an explicit HMAC algorithm
(`HS256`, `HS384`, `HS512`). With no algorithm at all, keys alone give a
TS2345 on `JwtOptions` instead, and a `secret` next to a `publicKey`
compiles: it is HMAC, and the key is ignored.

```text
error TS2353: Object literal may only specify known properties, and 'publicKey' does not exist in type 'Common & { readonly algorithm?: HmacAlgorithm; readonly secret: string | Uint8Array<ArrayBufferLike>; }'.
```

**Why:** the algorithm decides the key, and the default is `HS256`, which
takes a `secret`.

**Fix:** name the key algorithm that matches the keys:

```ts
createJwt({ algorithm: 'ES256', privateKey, publicKey });
```

### `Argument of type '{ algorithm: "ES256"; privateKey: CryptoKey; }' is not assignable to parameter of type 'JwtOptions'`

**When:** `createJwt` is given a key algorithm and a `privateKey` but no
`publicKey`.

```text
error TS2345: Argument of type '{ algorithm: "ES256"; privateKey: CryptoKey; }' is not assignable to parameter of type 'JwtOptions'.
```

**Why:** `publicKey` is always required — every `Jwt` verifies — while
`privateKey` is needed to sign only.

**Fix:** pass both on the service that signs; the public key alone on one
that only verifies:

```ts
const issuer = createJwt({ algorithm: 'ES256', privateKey, publicKey });
const verifier = createJwt({ algorithm: 'ES256', publicKey });
```

### `Property 'claims' does not exist on type 'VerifyResult'`

**When:** reading `result.claims` straight after `verify`.

```text
error TS2339: Property 'claims' does not exist on type 'VerifyResult'.
```

**Why:** `verify` resolves to `{ ok: true, claims }` or
`{ ok: false, reason }`. It does not throw for a bad token, so the claims
exist only once `ok` is checked.

**Fix:** narrow on `ok`:

```ts
const result = await jwt.verify(token);
if (!result.ok) return reply(401, { error: 'unauthorized' as const, reason: result.reason });
result.claims.sub;
```

### `Property 'role' comes from an index signature, so it must be accessed with ['role']`

**When:** reading a custom claim with a dot, under
`noPropertyAccessFromIndexSignature`.

```text
error TS4111: Property 'role' comes from an index signature, so it must be accessed with ['role'].
```

**Why:** `JwtClaims` types the registered claims (`sub`, `iss`, `aud`,
`exp`, `nbf`, `iat`, `jti`); any other is an index signature, `unknown`.

**Fix:** check the claims with a schema and read its output — or, behind
the guard, pass the schema to `bearer` and read `user`
([The bearer guard](guide/bearer-guard.md#typing-user-with-a-schema)):

```ts
const Claims = z.object({ sub: z.string(), role: z.enum(['admin', 'user']) });

const claims = Claims.parse(result.claims);
claims.role; // 'admin' | 'user'
```

### `Type 'unknown' is not assignable to type 'string'` on a claim

**When:** a custom claim, read as `result.claims['role']` or as
`user['role']` behind a guard without a schema, is used as a string.

```text
error TS2322: Type 'unknown' is not assignable to type 'string'.
```

**Why:** the package cannot know what you put in a token, and a token's
payload is whatever its signer chose: a custom claim is `unknown`.

**Fix:** the same as above — a schema, so the value is checked before it is
typed:

```ts
app.use(bearer({ jwt, schema: Claims })).get('/me', ({ user, reply }) => reply(200, user.role));
```

### `Type 'string | undefined' is not assignable to type 'string'` on `sub`

**When:** `result.claims.sub`, or `user.sub` behind a guard without a
schema, is used where a string is required.

```text
error TS2322: Type 'string | undefined' is not assignable to type 'string'.
```

**Why:** every registered claim is optional in a JWT: a token signed
without `sub` verifies.

**Fix:** a schema that requires it, or a fallback where an absent `sub` is
acceptable:

```ts
app.use(bearer({ jwt, schema: z.object({ sub: z.string() }) }));      // user.sub: string
app.use(bearer({ jwt })).get('/me', ({ user, reply }) => reply(200, user.sub ?? ''));
```

### `Property 'user' does not exist on type 'Context<…>'`

**When:** a route reads `user` but is declared before `use(bearer(…))`.

```text
error TS2339: Property 'user' does not exist on type 'Context<Empty, "/me", Empty>'.
```

**Why:** the guard is a middleware: it applies to the routes declared after
it, at runtime and in the types. A route before it is open, and has no
`user`.

**Fix:** declare the guard first, and keep open routes above it:

```ts
const app = alxia()
	.post('/login', /* … */)       // open
	.use(bearer({ jwt }))
	.get('/me', ({ user, reply }) => reply(200, user));
```

## Startup

### `TypeError: A JWT secret must hold at least 32 bytes`

**When:** `createJwt` is called with a `secret` shorter than 32 bytes —
often an unset variable read as `''`, or a short placeholder in a test.

**Why:** a short HMAC secret can be guessed offline from a single token.
The check runs when the `Jwt` is created, so the app fails at startup
rather than on the first login.

**Fix:** a random secret of 32 bytes or more
([Algorithms and keys](guide/algorithms-and-keys.md#a-secret)):

```ts
import { base64url } from '@alxia/jwt';

console.log(base64url(crypto.getRandomValues(new Uint8Array(32)))); // set it as JWT_SECRET
```

A string is counted in UTF-8 bytes, not characters. In a test, a fixed
literal of 32 characters or more is enough:

```ts
const jwt = createJwt({ secret: 'a-secret-of-at-least-thirty-two-bytes!' });
```

### `TypeError: createJwt: ES256 needs an ECDSA P-256 key; the publicKey is ECDSA P-384`

**When:** `createJwt` is given a key the algorithm cannot use: another
family, another curve, or another hash. The message names the algorithm,
the key it needs, which option is wrong, and what that key is:

```text
TypeError: createJwt: ES384 needs an ECDSA P-384 key; the publicKey is ECDSA P-256
TypeError: createJwt: RS256 needs an RSASSA-PKCS1-v1_5 SHA-256 key; the publicKey is RSASSA-PKCS1-v1_5 SHA-512
TypeError: createJwt: RS256 needs an RSASSA-PKCS1-v1_5 SHA-256 key; the publicKey is RSA-PSS SHA-256
TypeError: createJwt: EdDSA needs an Ed25519 key; the publicKey is ECDSA P-256
```

**Why:** each algorithm signs with one exact key — `ES256` with P-256,
`RS256` with a SHA-256 RSASSA-PKCS1-v1_5 key. Web Crypto would sign with a
P-384 key under `ES256`, and every other JWT library would then refuse the
token, so `createJwt` checks both keys when it is called and the app fails
at startup. The `publicKey` is checked first, then the `privateKey`.

**Fix:** generate or import the key with the parameters of the algorithm
you name ([Algorithms and keys](guide/algorithms-and-keys.md#a-key-pair)),
or name the algorithm the key was made for:

```ts
const ES256 = { name: 'ECDSA', namedCurve: 'P-256' };
const publicKey = await crypto.subtle.importKey('spki', der, ES256, false, ['verify']);
const jwt = createJwt({ algorithm: 'ES256', publicKey });
```

### `TypeError: createJwt: the publicKey must be a public key that can verify; it is a private key that can sign`

**When:** `createJwt` is given the private key as `publicKey` — the two
keys swapped, say — or a key imported without its usage. The same check on
the other key reads:

```text
TypeError: createJwt: the privateKey must be a private key that can sign; it is a public key that can verify
TypeError: createJwt: the publicKey must be a public key that can verify; it is a public key that can do nothing
```

**Why:** a `CryptoKey` carries its type and the operations it was imported
for, and Web Crypto checks them on every call. `createJwt` checks them once,
at startup, rather than letting the first request fail.

**Fix:** the private key from PKCS#8 with `['sign']`, the public key from
SPKI with `['verify']`:

```ts
const privateKey = await crypto.subtle.importKey('pkcs8', privateDer, ES256, false, ['sign']);
const publicKey = await crypto.subtle.importKey('spki', publicDer, ES256, false, ['verify']);
const jwt = createJwt({ algorithm: 'ES256', privateKey, publicKey });
```

## Runtime

### `TypeError: Signing needs a private key`

**When:** `sign` is called on a `Jwt` built with a key algorithm and a
`publicKey` only. The promise rejects.

**Why:** a verifier holds no private key, so it cannot sign — which is the
point of handing it the public key alone.

**Fix:** sign on the service that holds the private key, and pass it there:

```ts
const issuer = createJwt({ algorithm: 'ES256', privateKey, publicKey });
const token = await issuer.sign({ sub: 'ada' });
```

## Responses

What the guard answers when a request to a route after it carries no valid
token. Every one is a `401` with `WWW-Authenticate: Bearer`; the body is
`UnauthorizedBody` ([The bearer guard](guide/bearer-guard.md#the-401)). The
same `reason`s, without `missing` and `claims`, are what `jwt.verify`
resolves to.

### `401 {"error":"unauthorized","reason":"missing"}`

**When:** the request has no `Authorization: Bearer …` header and, if the
guard has a `cookie`, no cookie of that name.

**Why:** the guard reads the token from those two places only. Another
scheme (`Authorization: Basic …`, or a bare token with no `Bearer`) counts
as no header; a cookie is not read unless `cookie` names it.

**Fix:** send the header with its scheme, or name the cookie the token is
in:

```ts
await fetch('/me', { headers: { authorization: `Bearer ${token}` } });

app.use(bearer({ jwt, cookie: 'token' }));
```

### `401 {"error":"unauthorized","reason":"malformed"}`

**When:** the token is not three base64url parts separated by dots, its
header or payload is not JSON, its header is not an object (`null`, an
array, a number, a string or a boolean), or its payload is not an object.

**Why:** usually not a JWT at all: an opaque session id, a token missing a part,
a value still wrapped in quotes or URL-encoded. The header wins over the
cookie, so a stale `Authorization: Bearer` header hides a good cookie.

**Fix:** send the token exactly as `sign` returned it:

```ts
const token = await jwt.sign({ sub: 'ada' });
await fetch('/me', { headers: { authorization: `Bearer ${token}` } }); // not JSON.stringify(token)
```

### `401 {"error":"unauthorized","reason":"algorithm"}`

**When:** the token's header names another `alg` than the verifier's — a
token signed `HS512` checked by an `HS256` verifier, a token from another
issuer, or `alg: none`.

**Why:** the algorithm is fixed by the options and never read from the
token, which closes `alg: none` and algorithm-confusion attacks. A
verifier created without `algorithm` and with a `secret` expects `HS256`.

**Fix:** the same `algorithm` on both sides:

```ts
const options = { algorithm: 'HS512', secret: Bun.env['JWT_SECRET']! } as const;
const signer = createJwt(options);
const verifier = createJwt(options);
```

### `401 {"error":"unauthorized","reason":"signature"}`

**When:** the token was signed with another secret or private key than the
one the verifier checks against, or was altered after signing — its
signature cut short or replaced included.

**Why:** common causes are a secret that differs between two services or
two environments, a secret rotated while tokens signed with the old one
are still in use, or a public key that is not the private key's pair.

**Fix:** verify with the signer's secret, or the public key paired with its
private key. During a rotation, accept both
([Rotating a key](guide/algorithms-and-keys.md#rotating-a-key)):

```ts
const result = await current.verify(token);
return !result.ok && result.reason === 'signature' ? previous.verify(token) : result;
```

### `401 {"error":"unauthorized","reason":"expired"}`

**When:** the token's `exp` is at or before now, less `clockTolerance`
(5 seconds by default).

**Why:** the token lived its `expiresIn`. A very short-lived token can also
expire between two machines whose clocks disagree.

**Fix:** sign a new one — at login again, or from a refresh route of yours.
For clock skew between machines, widen the tolerance:

```ts
const jwt = createJwt({ secret: Bun.env['JWT_SECRET']!, expiresIn: 900, clockTolerance: 30 });
```

### `401 {"error":"unauthorized","reason":"not_yet_valid"}`

**When:** the token carries an `nbf` (not before) later than now plus
`clockTolerance`.

**Why:** `sign` never sets `nbf` itself, so this comes from a claim you
passed, or from a signer whose clock runs ahead.

**Fix:** pass `nbf` only for a token meant to start later, in seconds — not
milliseconds:

```ts
await jwt.sign({ sub: 'ada', nbf: Math.floor(Date.now() / 1000) + 60 });
```

### `401 {"error":"unauthorized","reason":"issuer"}`

**When:** the verifier has an `issuer` and the token's `iss` is absent or
different.

**Why:** the token was signed by a `Jwt` with another `issuer`, or none, or
its claims passed an `iss` that overrode the option.

**Fix:** the same `issuer` on the signer and the verifier:

```ts
const signer = createJwt({ secret, issuer: 'api' });
const verifier = createJwt({ secret, issuer: 'api' });
```

### `401 {"error":"unauthorized","reason":"audience"}`

**When:** the verifier has an `audience` and the token's `aud` is absent,
or neither equals it nor, as an array, holds it.

**Why:** the token was issued for another service — or the signer had no
`audience`, so the token has no `aud`.

**Fix:** sign with the audience of the service that will read the token; a
token for several names them all:

```ts
await jwt.sign({ sub: 'ada', aud: ['web', 'mobile'] });
const web = createJwt({ secret, audience: 'web' }); // accepts it
```

### `401 {"error":"unauthorized","reason":"claims","issues":[…]}`

**When:** the token verifies, but the guard's `schema` refuses its claims.

```text
401 {"error":"unauthorized","reason":"claims","issues":[{"target":"headers","path":["role"],"code":"invalid_value","message":"Invalid option: expected one of \"admin\"|\"user\""}]}
```

**Why:** the token was signed without a claim the schema requires, or with
a value it does not accept — a token issued before the schema changed,
say. Each issue's `path` names the claim, and its `target` where the token
was read: `headers` for `Authorization: Bearer`, `cookies` for the guard's
`cookie`.

**Fix:** sign every claim the schema requires, and make a claim added
later optional until the old tokens have expired:

```ts
const Claims = z.object({ sub: z.string(), role: z.enum(['admin', 'user']), team: z.string().optional() });
await jwt.sign({ sub: user.id, role: user.role, team: user.team });
```

## Traps

### A token is still accepted long after it was issued

**When:** the `Jwt` that signs it has no `expiresIn`, and the claims pass no
`exp`.

**Why:** `expiresIn` has no default. Without it, `sign` sets no `exp`, and
the token is valid for as long as the secret or key is.

**Fix:** set a lifetime on every signer:

```ts
const jwt = createJwt({ secret: Bun.env['JWT_SECRET']!, expiresIn: 15 * 60 });
```

### A token meant for another service is accepted

**When:** several services share a secret or a key pair, and the verifier
has no `issuer` or `audience`.

**Why:** both checks run only when the option is set. Without them, any
token the shared key signed is accepted.

**Fix:** name both, on the signer and on each verifier:

```ts
const billing = createJwt({ algorithm: 'ES256', publicKey, issuer: 'auth', audience: 'billing' });
```

### `user` has no `exp` or `iat`

**When:** the guard has a `schema`, and a route reads `user.exp`.

**Why:** `user` is the schema's output. A Zod object strips the keys it does
not declare, so the registered claims are gone unless the schema names
them.

**Fix:** declare the claims the routes read:

```ts
const Claims = z.object({ sub: z.string(), role: z.enum(['admin', 'user']), exp: z.number() });
```

### A missing path answers 401, not 404

**When:** an anonymous request to a path no route serves gets
`401 {"error":"unauthorized","reason":"missing"}`, where it used to get a 404.

**Why:** a guard given to `app.use` runs on every request, a request no route
matches included, and refuses before the 404. A guard in a `group` runs for
that group's routes only.

**Fix:** that is the guard working: it does not tell an anonymous caller
which paths exist. To guard some routes and leave the rest to answer
normally, put the guard in a group:

```ts
const app = alxia()
	.get('/health', ({ reply }) => reply(200, 'ok'))
	.group('/api', (api) =>
		api
			.use(bearer({ jwt }))
			.get('/me', ({ user, reply }) => reply(200, user)),
	);
// GET /nope        → 404
// GET /api/me      → 401 without a token
```

A path-scoped `app.use('/api', bearer({ jwt }))` does not compile: a
middleware given a path may add nothing to the context, and `bearer` adds
`user`.
