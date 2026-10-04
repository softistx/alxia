# Algorithms and keys

This page covers what signs a token: a shared secret for the HMAC
algorithms, or a key pair for ECDSA, RSA and EdDSA — how to generate one,
load it from PEM or JWK, verify without the private key, and rotate it.
Everything is the platform's Web Crypto: there is nothing else to install.

```ts
import { createJwt } from '@alxia/jwt';

// One service signs and verifies: a secret.
const jwt = createJwt({ secret: Bun.env['JWT_SECRET']!, expiresIn: 3600 });

// Several services verify what one signs: a key pair.
const { privateKey, publicKey } = await crypto.subtle.generateKey(
	{ name: 'ECDSA', namedCurve: 'P-256' },
	true,
	['sign', 'verify'],
);
const issuer = createJwt({ algorithm: 'ES256', privateKey, publicKey, expiresIn: 3600 });
const verifier = createJwt({ algorithm: 'ES256', publicKey }); // cannot sign
```

## Which to choose

| Algorithm | Options | Key | Choose it when |
| --- | --- | --- | --- |
| `HS256` (default), `HS384`, `HS512` | `secret` | a secret of at least 32 bytes | the same service signs and verifies |
| `ES256`, `ES384` | `publicKey`, `privateKey?` | ECDSA, P-256 / P-384 | other services verify; short signatures |
| `RS256`, `RS384`, `RS512` | `publicKey`, `privateKey?` | RSA PKCS#1 v1.5, SHA-256 / 384 / 512 | a verifier only speaks RSA |
| `EdDSA` | `publicKey`, `privateKey?` | Ed25519 | other services verify; fast, with nothing to tune |

With a secret, anyone who can verify can also sign. With a key pair, only
the holder of the private key signs, and the public key can be handed to
every service that verifies.

`createJwt` uses one algorithm. A token whose header names another is
refused with `reason: 'algorithm'`, so a token cannot choose `none` or
switch from a key pair to a secret.

## A secret

```ts
const jwt = createJwt({ algorithm: 'HS256', secret: Bun.env['JWT_SECRET']! });
```

The secret holds at least 32 bytes; a shorter one throws
`TypeError: A JWT secret must hold at least 32 bytes` from `createJwt`
([Troubleshooting](../troubleshooting.md#typeerror-a-jwt-secret-must-hold-at-least-32-bytes)).
A string is counted in UTF-8 bytes. Generate one at random rather than
typing it:

```ts
import { base64url } from '@alxia/jwt';

console.log(base64url(crypto.getRandomValues(new Uint8Array(32)))); // put it in JWT_SECRET
```

`secret` also takes the bytes themselves:

```ts
const jwt = createJwt({ secret: new Uint8Array(Buffer.from(Bun.env['JWT_SECRET']!, 'base64url')) });
```

## A key pair

`privateKey` and `publicKey` are Web Crypto `CryptoKey`s, made for the
algorithm you name. Each algorithm takes these parameters, for
`generateKey` and `importKey` alike:

| `algorithm` | Key parameters |
| --- | --- |
| `ES256` | `{ name: 'ECDSA', namedCurve: 'P-256' }` |
| `ES384` | `{ name: 'ECDSA', namedCurve: 'P-384' }` |
| `RS256` | `{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }` (plus `modulusLength` and `publicExponent` to generate) |
| `RS384` | `{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' }` |
| `RS512` | `{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' }` |
| `EdDSA` | `{ name: 'Ed25519' }` |

One pair per family, generated with Web Crypto:

```ts
import { createJwt } from '@alxia/jwt';

// ES256 (P-384 for ES384)
const ec = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
createJwt({ algorithm: 'ES256', ...ec });

// RS256 (SHA-384 for RS384, SHA-512 for RS512)
const rsa = await crypto.subtle.generateKey(
	{ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
	true,
	['sign', 'verify'],
);
createJwt({ algorithm: 'RS256', ...rsa });

// EdDSA
const ed = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
createJwt({ algorithm: 'EdDSA', ...ed });
```

`createJwt` checks each key against the algorithm when it is called, so a
wrong key fails the app at startup rather than on a request. A key of
another family, curve or hash — an Ed25519 key or a P-384 key under
`ES256`, a SHA-512 or RSA-PSS key under `RS256` — throws:

```text
TypeError: createJwt: ES256 needs an ECDSA P-256 key; the publicKey is ECDSA P-384
```

([Troubleshooting](../troubleshooting.md#typeerror-createjwt-es256-needs-an-ecdsa-p-256-key-the-publickey-is-ecdsa-p-384)).
The curve or hash matters even though Web Crypto would sign with it: a
standard verifier refuses an `ES256` token signed on P-384.

### Loading a PEM key

A key pair made with OpenSSL is PEM: PKCS#8 for the private key, SPKI for
the public one.

```sh
# ES256 (P-384 for ES384)
openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-256 -pkeyopt ec_param_enc:named_curve -out private.pem
# RS256, RS384, RS512
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem

openssl pkey -in private.pem -pubout -out public.pem
```

`ec_param_enc:named_curve` keeps the curve as a name, which Web Crypto
requires; LibreSSL (the `openssl` on macOS) otherwise writes the curve out
in full, and `importKey('spki', …)` throws `DataError: Invalid keyData`. An
Ed25519 pair can come from OpenSSL 3 (`openssl genpkey -algorithm ed25519`),
or from Web Crypto, exported once:

```ts
const pair = await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
const armour = (label: string, der: ArrayBuffer) =>
	`-----BEGIN ${label}-----\n${Buffer.from(der).toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END ${label}-----\n`;

await Bun.write('private.pem', armour('PRIVATE KEY', await crypto.subtle.exportKey('pkcs8', pair.privateKey)));
await Bun.write('public.pem', armour('PUBLIC KEY', await crypto.subtle.exportKey('spki', pair.publicKey)));
```

Strip the armour, decode the base64, and import:

```ts
import { createJwt } from '@alxia/jwt';

function pem(text: string): Uint8Array<ArrayBuffer> {
	return new Uint8Array(Buffer.from(text.replace(/-----[A-Z ]+-----|\s/g, ''), 'base64'));
}

const ES256 = { name: 'ECDSA', namedCurve: 'P-256' };
// or: const RS256 = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }; const EdDSA = { name: 'Ed25519' };

const jwt = createJwt({
	algorithm: 'ES256',
	privateKey: await crypto.subtle.importKey('pkcs8', pem(Bun.env['JWT_PRIVATE_KEY']!), ES256, false, ['sign']),
	publicKey: await crypto.subtle.importKey('spki', pem(Bun.env['JWT_PUBLIC_KEY']!), ES256, false, ['verify']),
	expiresIn: 3600,
});
```

Import the private key with the `sign` usage and the public key with
`verify`, using the parameters of the table above. A key without its usage,
or the two keys swapped, is refused by `createJwt` at once:

```text
TypeError: createJwt: the publicKey must be a public key that can verify; it is a private key that can sign
TypeError: createJwt: the privateKey must be a private key that can sign; it is a public key that can verify
```

([Troubleshooting](../troubleshooting.md#typeerror-createjwt-the-publickey-must-be-a-public-key-that-can-verify-it-is-a-private-key-that-can-sign)).
The keys can be non-extractable (`false`): the package never reads them.

### Loading a JWK

A public key published as a JWK — a single key, not a key set:

```ts
const jwk: JsonWebKey = await Bun.file('public.jwk.json').json();
const publicKey = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);

const verifier = createJwt({ algorithm: 'ES256', publicKey });
```

Tokens carry no `kid` header, and `createJwt` holds one public key, so a
JWKS endpoint with several keys is not fetched or selected from; see
[Rotating a key](#rotating-a-key) for two keys at once.

## Verifying without the private key

A service that only checks tokens gets the public key alone:

```ts
const verifier = createJwt({ algorithm: 'ES256', publicKey, issuer: 'auth', audience: 'billing' });

await verifier.verify(token);   // works
await verifier.sign({});        // rejects: TypeError: Signing needs a private key
```

Give it `issuer` and `audience` too: the signature proves who signed, the
audience proves the token was meant for this service.

## Rotating a key

`createJwt` holds one secret or one key pair. To accept the previous one
while tokens signed with it are still alive, verify with the new one, then
the old one on a bad signature. The result is a `Jwt`, so it goes wherever
one does — [the bearer guard](bearer-guard.md) included:

```ts
import { bearer, createJwt, type Jwt } from '@alxia/jwt';

const current = createJwt({ secret: Bun.env['JWT_SECRET']!, expiresIn: 3600 });
const previous = createJwt({ secret: Bun.env['JWT_PREVIOUS_SECRET']! });

const jwt: Jwt = {
	algorithm: current.algorithm,
	sign: (claims, options) => current.sign(claims, options),
	async verify(token) {
		const result = await current.verify(token);
		return !result.ok && result.reason === 'signature' ? previous.verify(token) : result;
	},
};

app.plugin(bearer({ jwt }));
```

Drop `previous` once the longest `expiresIn` has passed since the switch.

## See also

- [Signing and verifying](tokens.md): the options, `sign`, `verify` and each `reason`.
- [The bearer guard](bearer-guard.md): putting a verifier in front of routes.
- [Troubleshooting](../troubleshooting.md#startup): key errors and their fixes.
