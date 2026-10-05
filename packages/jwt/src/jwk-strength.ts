import { base64url, fromBase64url } from './base64url';
import type { Jwk } from './jwk';

/** The RSA moduli accepted, in bits. */
const MIN_MODULUS_BITS = 2048;
const MAX_MODULUS_BITS = 8192;

/**
 * The bytes of a JWK member, decoded strictly: base64url without padding,
 * in its one canonical spelling, or `undefined`.
 */
function strictBytes(value: unknown): Uint8Array | undefined {
	if (typeof value !== 'string') return undefined;
	let bytes: Uint8Array;
	try {
		bytes = fromBase64url(value);
	} catch {
		return undefined;
	}
	// Unused trailing bits, which a lenient decoder drops, would make two spellings of one key.
	return base64url(bytes) === value ? bytes : undefined;
}

const bitLength = (byte: number) => 32 - Math.clz32(byte);

/** An odd public exponent of at least 3, which Web Crypto in Bun does not insist on. */
function exponentFits(jwk: Jwk): boolean {
	const bytes = strictBytes(jwk['e']);
	if (bytes === undefined) return false;
	const last = bytes.at(-1) ?? 0;
	return (
		last % 2 === 1 &&
		bytes.some((byte, i) => byte > (i === bytes.length - 1 ? 1 : 0))
	);
}

/** A modulus of 2048 to 8192 bits, counted from its first set bit, and a sound exponent. */
export function rsaFits(jwk: Jwk): boolean {
	const bytes = strictBytes(jwk['n']);
	if (bytes === undefined) return false;
	// A leading zero byte is padding, not size.
	const first = bytes.findIndex((byte) => byte !== 0);
	const bits =
		first === -1
			? 0
			: (bytes.length - first - 1) * 8 + bitLength(bytes[first] as number);
	return (
		bits >= MIN_MODULUS_BITS && bits <= MAX_MODULUS_BITS && exponentFits(jwk)
	);
}

const filled = (head: number[], fill: number, last: number) => {
	const bytes = new Array<number>(32).fill(fill);
	bytes.splice(0, head.length, ...head);
	bytes[31] = last;
	return bytes;
};

/**
 * The Ed25519 encodings of a point of small order, libsodium's
 * `has_small_order` list: the identity, the points of order 2, 4 and 8,
 * and the non-canonical spellings p - 1, p and p + 1. Any of them as a
 * public key verifies a signature anyone can make.
 */
const SMALL_ORDER: readonly (readonly number[])[] = [
	filled([], 0x00, 0x00),
	filled([0x01], 0x00, 0x00),
	[
		0x26, 0xe8, 0x95, 0x8f, 0xc2, 0xb2, 0x27, 0xb0, 0x45, 0xc3, 0xf4, 0x89,
		0xf2, 0xef, 0x98, 0xf0, 0xd5, 0xdf, 0xac, 0x05, 0xd3, 0xc6, 0x33, 0x39,
		0xb1, 0x38, 0x02, 0x88, 0x6d, 0x53, 0xfc, 0x05,
	],
	[
		0xc7, 0x17, 0x6a, 0x70, 0x3d, 0x4d, 0xd8, 0x4f, 0xba, 0x3c, 0x0b, 0x76,
		0x0d, 0x10, 0x67, 0x0f, 0x2a, 0x20, 0x53, 0xfa, 0x2c, 0x39, 0xcc, 0xc6,
		0x4e, 0xc7, 0xfd, 0x77, 0x92, 0xac, 0x03, 0x7a,
	],
	filled([0xec], 0xff, 0x7f),
	filled([0xed], 0xff, 0x7f),
	filled([0xee], 0xff, 0x7f),
];

/** An Ed25519 key of exactly 32 bytes that is not a point of small order, compared with the sign bit cleared. */
export function okpFits(jwk: Jwk): boolean {
	const bytes = strictBytes(jwk['x']);
	if (bytes?.length !== 32) return false;
	return !SMALL_ORDER.some((point) =>
		point.every(
			(byte, i) => byte === (i === 31 ? (bytes[i] as number) & 0x7f : bytes[i]),
		),
	);
}

/** The coordinate size of each EC curve a JWKS key may use, in bytes. */
const EC_SIZES: Record<string, number> = { 'P-256': 32, 'P-384': 48 };

/** An EC key whose `x` and `y` are strict base64url of its curve's size; Web Crypto checks the point is on it. */
export function ecFits(jwk: Jwk): boolean {
	const size = typeof jwk.crv === 'string' ? EC_SIZES[jwk.crv] : undefined;
	return (
		size !== undefined &&
		strictBytes(jwk['x'])?.length === size &&
		strictBytes(jwk['y'])?.length === size
	);
}
