# Verifying tokens from an identity provider

Keycloak, Auth0, Ory, Cognito and every OpenID Connect provider sign tokens
with a private key they keep and publish the public keys as a JSON Web Key
Set (JWKS). `createJwt({ jwks })` fetches that set and verifies each token
with the key its `kid` names. It is verification only: there is nothing to
sign with, and the provider rotates its keys without you redeploying.

```ts
import { createJwt } from '@alxia/jwt';

export const jwt = createJwt({
	jwks: 'https://idp.example.com/.well-known/jwks.json',
	issuer: 'https://idp.example.com/',
	audience: 'my-api',
});
```

Everything else is the guard you already know: `bearer({ jwt, schema })`
gives the routes behind it a typed `user`
([The bearer guard](bearer-guard.md)). No new dependency: the keys are
imported with Web Crypto.

## The options

| Option | Default | Meaning |
| --- | --- | --- |
| `jwks` | | the key set's URL; `https`, or `http` on localhost |
| `discovery` | | instead of `jwks`, never both: an issuer URL, as a string (not a `URL`), whose `/.well-known/openid-configuration` names the set (`jwks_uri`, which must be `https`); the document must name that same issuer, compared byte for byte, trailing slash included, and `issuer` defaults to it |
| `issuer`, `audience` | with `jwks`, none; with `discovery`, `issuer` is the discovery URL | checked against `iss` and `aud` |
| `clockTolerance` | `5` | seconds of skew allowed on `exp` and `nbf` |
| `cacheMs` | `600_000` | how long a fetched set is used, when the response has no `Cache-Control: max-age` |
| `staleMs` | `86_400_000` | how long a set past its lifetime stays usable while the issuer cannot be reached |
| `refetchMs` | `30_000` | the least time between two fetches, failures included |
| `timeoutMs` | `5_000` | how long a fetch may take |
| `algorithms` | all nine | the algorithms accepted: `RS256`, `RS384`, `RS512`, `PS256`, `PS384`, `PS512`, `ES256`, `ES384`, `EdDSA` |

`createJwt({ discovery })` is the shortest form for a provider that
publishes an OpenID configuration:

```ts
const jwt = createJwt({ discovery: 'https://idp.example.com/realms/acme', audience: 'my-api' });
```

Set `audience` (and `issuer`, with `jwks`): a signature proves the provider
issued the token, not that it was issued for your API, and a provider signs
tokens for all its clients with the same keys. A token without `exp` is
accepted: have the provider put one in, or check it in a schema.

## How a token is checked

1. The token's header gives `alg` and `kid`. The `alg` must be one of the
   nine above (and of `algorithms`, if given): `none` and every `HS*` are
   refused with `reason: 'algorithm'`.
2. The key is the set's, by `kid`. Without a `kid`, the one key that fits
   the algorithm, if there is exactly one.
3. The key's kind must fit the algorithm: an RSA key verifies `RS*` and
   `PS*`, an EC key `ES256` (P-256) and `ES384` (P-384), an Ed25519 key
   `EdDSA`. A key with a `use` other than `sig`, with a `key_ops` that is
   not an array naming `verify`, or with an `alg` of its own that differs,
   does not fit.
4. The signature, then `exp`, `nbf`, `iss` and `aud`.

The token never chooses how it is checked. An attacker who signs an `HS256`
token with the issuer's RSA public key as the secret is refused at step 1:
the algorithm-confusion attack has nothing to work with.

## Fetching and caching

- **One fetch for many requests.** Concurrent requests share the fetch in
  flight, and the set is kept in memory for `cacheMs`, or for the response's
  `Cache-Control: max-age` when it has one (never under `refetchMs`, never
  over a day).
- **An unknown `kid` refetches once.** A provider that rotated its keys is
  followed without a restart. A token naming a `kid` the set does not have
  triggers one refetch, then is refused as `key`. Fetches, failures included,
  are at least `refetchMs` apart, so a flood of tokens with invented `kid`s
  costs the provider one request per 30 seconds, not one per token. The
  price: a key added less than `refetchMs` after the last fetch is not found
  until the window passes. Lower `refetchMs` if your provider rotates fast.
- **Removing a key takes up to `cacheMs`.** A key the provider dropped keeps
  verifying until the cached set expires. Lower `cacheMs`, or have the
  provider send a short `max-age`, when you need a revocation sooner;
  `exp` is what bounds a stolen token.
- **Fail closed, with a grace period.** With nothing cached and the issuer
  unreachable, every token is refused as `keys_unavailable`. With a set
  cached, an outage is ridden out: the expired set stays usable for
  `staleMs` (a day by default), because an issuer's keys change rarely and
  its outage should not take your API down. After that, `keys_unavailable`.
  `staleMs: 0` refuses the moment the set expires. The price is that a key
  the provider revoked or rotated out stays trusted for that long while it
  is down: choose `staleMs` by which risk you mind more.
- **Fetch at startup.** `await jwt.refresh()` warms the cache, so the first
  request pays no fetch and a wrong URL shows at boot (it never throws:
  the verifier answers `keys_unavailable` until it can fetch).

The fetch is strict: `https` only (plain `http` on localhost, for a local
provider), no redirects, at most 256 KiB (counted as the body streams in),
within `timeoutMs`, `application/json` asked for. The keys are checked
before Web Crypto sees them, and a key refused answers `key`: an RSA key
whose modulus is outside 2048 to 8192 bits (counted from its first set
bit), or with an even or trivial exponent; an Ed25519 key whose `x` is not
exactly 32 bytes, or is a point of small order (the identity, the all-zero
point, and the rest of libsodium's `has_small_order` list), under which a
signature anyone can make verifies; an EC key whose `x` and `y` are not
its curve's size (32 bytes for P-256, 48 for P-384); and any key whose
`n`, `e`, `x` or `y` is not strict, unpadded base64url. Only a key's
public members reach Web Crypto. A `jwks_uri` read from a discovery document must be `https`, unless the
issuer itself is on localhost. The cache's lifetimes and refetch limit run
on a monotonic clock, so setting the system clock neither keeps a set past
its lifetime nor lifts the limit.

## Keycloak

The realm's issuer URL serves the configuration:

```ts
import { bearer, createJwt } from '@alxia/jwt';
import { z } from 'zod';

const jwt = createJwt({
	discovery: 'https://keycloak.example.com/realms/my-realm',
	audience: 'my-api', // the access token's aud, set by an audience mapper
});

const Claims = z.object({
	sub: z.string(),
	realm_access: z.object({ roles: z.array(z.string()) }).optional(),
});
export const authenticated = bearer({ jwt, schema: Claims });
```

## Auth0

The tenant's issuer ends with a slash, and `discovery` must match it
exactly:

```ts
const jwt = createJwt({
	discovery: 'https://my-tenant.eu.auth0.com/',
	audience: 'https://api.example.com', // the API identifier
});
```

## Ory

Ory Network's issuer is the project's URL:

```ts
const jwt = createJwt({
	discovery: 'https://my-project.projects.oryapis.com',
	audience: 'my-api',
});
```

## Cognito and others

Where the provider does not publish a configuration you rely on, give the
set's URL and the issuer yourself:

```ts
const jwt = createJwt({
	jwks: 'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_EXAMPLE/.well-known/jwks.json',
	issuer: 'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_EXAMPLE',
});
```

A Cognito access token carries `client_id` rather than `aud`: validate it
with a schema on `bearer` instead of `audience`.

## What it does not do

- It does not read a token's claims for you beyond the registered ones:
  give `bearer` a schema.
- It does not introspect or revoke tokens: a token is valid until its `exp`.
- It does not sign. Tokens your own service issues use a secret or a key
  pair ([Algorithms and keys](algorithms-and-keys.md)).

Errors and what to do about them: [Troubleshooting](../troubleshooting.md),
under `key`, `keys_unavailable`, `algorithm` and the URL errors.
