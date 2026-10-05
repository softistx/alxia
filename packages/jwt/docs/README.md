# @alxia/jwt documentation

The [package README](../README.md) is the short version. This folder is
the long one: a guide page per area, with the options, defaults, errors and
a realistic example for each.

## Guide

| Page | Read it when |
| --- | --- |
| [Signing and verifying](guide/tokens.md) | issuing a token from a login route, setting its lifetime, issuer and audience, or reading why `verify` refused one |
| [Algorithms and keys](guide/algorithms-and-keys.md) | choosing between a secret and a key pair, generating or loading a PEM or JWK key for each algorithm, reading why `createJwt` refused a key, verifying without the private key, or rotating a key |
| [An identity provider's tokens](guide/jwks.md) | verifying tokens from Keycloak, Auth0, Ory or Cognito by their published keys, tuning the cache, the refetch limit and the outage grace period, or reading why a token was refused as `key` or `keys_unavailable` |
| [The bearer guard](guide/bearer-guard.md) | guarding routes behind a token from a header or a cookie, typing `user` with a schema, or reading the 401 from a client |
| [Troubleshooting](troubleshooting.md) | something went wrong and you have the message |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |

## Recipes

A task that crosses packages, in [the repository's recipes](https://github.com/softistx/alxia/blob/develop/docs/recipes/README.md), each with a complete example:

- [Authenticate requests](https://github.com/softistx/alxia/blob/develop/docs/recipes/authentication.md): a bearer token or a cookie session, a role check, the user typed in every handler
- [A GraphQL API](https://github.com/softistx/alxia/blob/develop/docs/recipes/graphql-api.md): typed resolvers, a viewer, subscriptions, GraphiQL, auth errors and the drain
