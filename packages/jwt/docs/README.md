# @alxia/jwt documentation

The [package README](../README.md) is the short version. This folder is
the long one: a guide page per area, with the options, defaults, errors and
a realistic example for each.

## Guide

| Page | Read it when |
| --- | --- |
| [Signing and verifying](guide/tokens.md) | issuing a token from a login route, setting its lifetime, issuer and audience, or reading why `verify` refused one |
| [Algorithms and keys](guide/algorithms-and-keys.md) | choosing between a secret and a key pair, generating or loading a PEM or JWK key, verifying without the private key, or rotating a key |
| [The bearer guard](guide/bearer-guard.md) | guarding routes behind a token from a header or a cookie, typing `user` with a schema, or reading the 401 from a client |
| [Troubleshooting](troubleshooting.md) | something went wrong and you have the message |
| [Roadmap](roadmap.md) | wondering what is coming, and what is not planned |
