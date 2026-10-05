---
'@alxia/jwt': minor
---

Verify the tokens of an identity provider by its published keys: `createJwt({ jwks })`, or `createJwt({ discovery })` to read `jwks_uri` from the issuer's OpenID configuration, for Keycloak, Auth0, Ory or Cognito. The key is found by the token's `kid` and verified with Web Crypto (`RS256/384/512`, `PS256/384/512`, `ES256/384`, `EdDSA`), with no dependency. The set is cached by `Cache-Control: max-age` or `cacheMs`, refetched once on an unknown `kid` and never more often than `refetchMs`, and used for `staleMs` past its lifetime while the issuer is down; with nothing cached the guard fails closed. `alg: none`, every `HS*` token and an algorithm the key's type does not allow are refused, so a public key cannot be used as a secret. A new `JwksJwt` and `Verifier` (what `bearer` takes), and the reasons `key` and `keys_unavailable`. HS and key-pair behaviour is unchanged.
