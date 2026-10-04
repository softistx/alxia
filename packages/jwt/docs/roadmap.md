# Roadmap

What `@alxia/jwt` gives an app, and what is coming. This page is a
direction, not a commitment: the version something shipped in is the only
number on it. Every release, with each change it made, is in
[`CHANGELOG.md`](https://github.com/softistx/alxia/blob/develop/packages/jwt/CHANGELOG.md).

## Now

Nothing scheduled yet.

## Next

Nothing scheduled yet.

## Later

Nothing scheduled yet.

## Not planned

- **A runtime dependency.** `@alxia/jwt` signs and verifies with the
  platform's own Web Crypto, and installs nothing beside itself and its
  `@alxia/core` peer: adding it to an app adds no JWT or crypto library to
  audit or update.

## Shipped

### 0.1.0

- **Tokens on Web Crypto.** `createJwt` signs and verifies JSON Web Tokens
  with a secret of at least 32 bytes (`HS256`, `HS384`, `HS512`) or a key
  pair (`ES256`, `ES384`, `RS256`, `RS384`, `RS512`, `EdDSA`). A service
  that only verifies holds the public key alone, and cannot sign. A key
  that does not fit the algorithm — another family, curve or hash, the
  wrong type, a missing usage — is refused by `createJwt`, so the app fails
  at startup instead of signing tokens other libraries refuse.
- **Verification that cannot be talked out of its checks.** The algorithm
  comes from the options, never from the token, so `alg: none` and
  algorithm confusion are refused. `verify` checks the signature, `exp` and
  `nbf` with a clock tolerance, the issuer and the audience, and resolves
  to the claims or to the reason it refused — it never throws, whatever the
  token holds.
- **Lifetimes, issuer and audience set for you.** `sign` adds `iat`, and
  `exp`, `iss` and `aud` from the options, with a per-token `expiresIn`;
  claims you pass override them.
- **A typed bearer guard.** `bearer` makes every route declared after it
  require a token, from `Authorization: Bearer` or a named cookie, and reads
  its claims — checked by any Standard Schema — as a typed `user`; a
  refused claim's issue names where the token was read, `headers` or
  `cookies`.
  Otherwise it answers a `401` with `WWW-Authenticate: Bearer` and a body
  naming the reason.
