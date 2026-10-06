/**
 * RFC 7520 (JOSE Cookbook): the P-521 key of 3.1 and 3.2, and the ES512
 * signature of 4.3 over its payload. ECDSA is randomised, so the vector is
 * one signature the key made, which any conforming verifier accepts.
 */

/** Figure 1: the public key, as a JWKS publishes it. */
export const RFC7520_PUBLIC = {
	kty: 'EC',
	kid: 'bilbo.baggins@hobbiton.example',
	use: 'sig',
	crv: 'P-521',
	x: 'AHKZLLOsCOzz5cY97ewNUajB957y-C-U88c3v13nmGZx6sYl_oJXu9A5RkTKqjqvjyekWF-7ytDyRXYgCF5cj0Kt',
	y: 'AdymlHvOiLxXkEhayXQnNCvDX4h9htZaCJN34kfmC6pV5OhQHiraVySsUdaQkAgDPrwQrJmbnX9cwlGfP-HqHZR1',
} as const;

/** Figure 2: the private key. */
export const RFC7520_PRIVATE = {
	...RFC7520_PUBLIC,
	d: 'AAhRON2r9cqXX1hg-RoI6R1tX5p2rUAYdmpHZoC1XNM56KtscrX6zbKipQrCW9CGZH3T4ubpnoTKLDYJ_fF3_rJt',
} as const;

/** Figure 27: the JWS, in the compact serialization. Its payload is text, not claims. */
export const RFC7520_JWS = [
	'eyJhbGciOiJFUzUxMiIsImtpZCI6ImJpbGJvLmJhZ2dpbnNAaG9iYml0b24uZXhhbXBsZSJ9',
	'SXTigJlzIGEgZGFuZ2Vyb3VzIGJ1c2luZXNzLCBGcm9kbywgZ29pbmcgb3V0IHlvdXIgZG9vci4gWW91IHN0ZXAgb250byB0aGUgcm9hZCwgYW5kIGlmIHlvdSBkb24ndCBrZWVwIHlvdXIgZmVldCwgdGhlcmXigJlzIG5vIGtub3dpbmcgd2hlcmUgeW91IG1pZ2h0IGJlIHN3ZXB0IG9mZiB0by4',
	'AE_R_YZCChjn4791jSQCrdPZCNYqHXCTZH0-JZGYNlaAjP2kqaluUIIUnC9qvbu9Plon7KRTzoNEuT4Va2cmL1eJAQy3mtPBu_u_sDDyYjnAMDxXPn7XrT0lw-kvAD890jl8e2puQens_IEKBpHABlsbEPX6sFY8OcGDqoRuBomu9xQ2',
].join('.');

const P521 = { name: 'ECDSA', namedCurve: 'P-521' };

/** The RFC 7520 key pair, imported for `createJwt({ algorithm: 'ES512' })`. */
export async function rfc7520Pair(): Promise<CryptoKeyPair> {
	const { kty, crv, x, y } = RFC7520_PUBLIC;
	const point = { kty, crv, x, y };
	return {
		privateKey: await crypto.subtle.importKey(
			'jwk',
			{ ...point, d: RFC7520_PRIVATE.d },
			P521,
			false,
			['sign'],
		),
		publicKey: await crypto.subtle.importKey('jwk', point, P521, false, [
			'verify',
		]),
	};
}
