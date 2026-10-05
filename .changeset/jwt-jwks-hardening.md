---
'@alxia/jwt': patch
---

Security fix, upgrading is recommended: a key set holding an Ed25519 key of small order (the identity point, the all-zero point, or any other point of libsodium's `has_small_order` list) could be used to forge tokens, since under such a key a signature anyone can make verifies. A `jwks` or `discovery` verifier now refuses those keys, and any Ed25519 key that is not exactly 32 bytes, as `key`. Also: an RSA modulus is counted in bits from its first set bit (2048 to 8192), a key's `n`, `e`, `x` and `y` must be strict, unpadded base64url (and an EC key's coordinates its curve's size), a `key_ops` that is not an array no longer matches (nor answers a 500), the key cache's lifetimes and refetch limit run on a monotonic clock, and a verifier by a secret or a key pair refuses a header with `crit` as `malformed`, as the `jwks` one already did. The test fixtures no longer ship in the tarball.
