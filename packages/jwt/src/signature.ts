/**
 * The length of an ECDSA signature in a JWS: `r` and `s`, each padded to
 * the curve's size and concatenated (RFC 7518, 3.4). A DER signature, or
 * one of any other length, is refused before Web Crypto reads it.
 */
const ECDSA_BYTES: Readonly<Record<string, number>> = {
	ES256: 64,
	ES384: 96,
	ES512: 132,
};

/** Whether `signature` has the one length `algorithm` signs with; only ECDSA has a fixed one to check. */
export function signatureFits(
	algorithm: string,
	signature: Uint8Array,
): boolean {
	const bytes = Object.hasOwn(ECDSA_BYTES, algorithm)
		? ECDSA_BYTES[algorithm]
		: undefined;
	return bytes === undefined || signature.byteLength === bytes;
}
