import { okpFits, rsaFits } from './jwk-strength';

/** The algorithms a JWKS key can verify: the asymmetric ones Web Crypto supports. */
export type JwksAlgorithm =
	| 'RS256'
	| 'RS384'
	| 'RS512'
	| 'PS256'
	| 'PS384'
	| 'PS512'
	| 'ES256'
	| 'ES384'
	| 'EdDSA';

export const JWKS_ALGORITHMS: readonly JwksAlgorithm[] = [
	'RS256',
	'RS384',
	'RS512',
	'PS256',
	'PS384',
	'PS512',
	'ES256',
	'ES384',
	'EdDSA',
];

/** A key of a JSON Web Key Set, as published. */
export interface Jwk {
	readonly kty: string;
	readonly kid?: string;
	readonly use?: string;
	readonly alg?: string;
	readonly key_ops?: readonly string[];
	readonly crv?: string;
	readonly [member: string]: unknown;
}

interface Spec {
	readonly kty: 'RSA' | 'EC' | 'OKP';
	readonly crv?: string;
	/** How Web Crypto imports the key. */
	readonly import: RsaHashedImportParams | EcKeyImportParams | Algorithm_;
	/** How it verifies. */
	readonly verify: AlgorithmIdentifier | RsaPssParams | EcdsaParams;
}
type Algorithm_ = { name: string };

const rsa = (name: string, hash: string, bits: number): Spec => ({
	kty: 'RSA',
	import: { name, hash },
	verify: name === 'RSA-PSS' ? { name, saltLength: bits / 8 } : { name },
});

const ec = (crv: string, hash: string): Spec => ({
	kty: 'EC',
	crv,
	import: { name: 'ECDSA', namedCurve: crv },
	verify: { name: 'ECDSA', hash } as EcdsaParams,
});

const SPECS: Record<JwksAlgorithm, Spec> = {
	RS256: rsa('RSASSA-PKCS1-v1_5', 'SHA-256', 256),
	RS384: rsa('RSASSA-PKCS1-v1_5', 'SHA-384', 384),
	RS512: rsa('RSASSA-PKCS1-v1_5', 'SHA-512', 512),
	PS256: rsa('RSA-PSS', 'SHA-256', 256),
	PS384: rsa('RSA-PSS', 'SHA-384', 384),
	PS512: rsa('RSA-PSS', 'SHA-512', 512),
	ES256: ec('P-256', 'SHA-256'),
	ES384: ec('P-384', 'SHA-384'),
	EdDSA: {
		kty: 'OKP',
		crv: 'Ed25519',
		import: { name: 'Ed25519' },
		verify: { name: 'Ed25519' },
	},
};

export const isJwksAlgorithm = (value: unknown): value is JwksAlgorithm =>
	typeof value === 'string' && Object.hasOwn(SPECS, value);

/** Keys that fit `algorithm`: right type and curve, usable for signatures, not pinned to another algorithm. */
function fits(jwk: Jwk, algorithm: JwksAlgorithm): boolean {
	const spec = SPECS[algorithm];
	return (
		jwk.kty === spec.kty &&
		jwk.crv === spec.crv &&
		(jwk.use === undefined || jwk.use === 'sig') &&
		(jwk.key_ops === undefined ||
			(Array.isArray(jwk.key_ops) && jwk.key_ops.includes('verify'))) &&
		(jwk.alg === undefined || jwk.alg === algorithm)
	);
}

/**
 * The key a token is verified with: found by `kid`, or the only one that
 * fits when the token names none. `'unknown'` means the set has no such key
 * (a refetch may find it); `'mismatch'` means it has one that this
 * algorithm may not use, which no refetch fixes.
 */
export function selectKey(
	keys: readonly Jwk[],
	algorithm: JwksAlgorithm,
	kid: unknown,
): Jwk | 'unknown' | 'mismatch' {
	if (kid !== undefined && typeof kid !== 'string') return 'unknown';
	const named = kid === undefined ? keys : keys.filter((k) => k.kid === kid);
	if (named.length === 0) return 'unknown';
	const fitting = named.filter((jwk) => fits(jwk, algorithm));
	if (kid === undefined) {
		return fitting.length === 1 ? (fitting[0] as Jwk) : 'unknown';
	}
	return fitting[0] ?? 'mismatch';
}

/** Only the public members: whatever else a set carries never reaches Web Crypto. */
function publicMembers(jwk: Jwk): JsonWebKey {
	const pick = (...names: string[]) =>
		Object.fromEntries(names.map((name) => [name, jwk[name]]));
	return (
		jwk.kty === 'RSA'
			? pick('kty', 'n', 'e')
			: jwk.kty === 'EC'
				? pick('kty', 'crv', 'x', 'y')
				: pick('kty', 'crv', 'x')
	) as JsonWebKey;
}

const imported = new WeakMap<Jwk, Map<JwksAlgorithm, Promise<CryptoKey>>>();

/** Why Web Crypto is never handed `jwk`: a key it would import and that no signature should be checked by. */
function weakness(jwk: Jwk): string | undefined {
	if (jwk.kty === 'RSA' && !rsaFits(jwk)) {
		return 'RSA key outside 2048 to 8192 bits, or with an even or trivial exponent';
	}
	if (jwk.kty === 'OKP' && !okpFits(jwk)) {
		return 'Ed25519 key not of 32 bytes, or a point of small order';
	}
	return undefined;
}

/** The verifying key of `jwk` for `algorithm`, imported once; rejects on a key Web Crypto or the strength checks refuse. */
export function importKey(
	jwk: Jwk,
	algorithm: JwksAlgorithm,
): Promise<CryptoKey> {
	const byAlgorithm =
		imported.get(jwk) ?? new Map<JwksAlgorithm, Promise<CryptoKey>>();
	imported.set(jwk, byAlgorithm);
	let key = byAlgorithm.get(algorithm);
	if (key === undefined) {
		const weak = weakness(jwk);
		key =
			weak === undefined
				? crypto.subtle.importKey(
						'jwk',
						publicMembers(jwk),
						SPECS[algorithm].import,
						false,
						['verify'],
					)
				: Promise.reject(new TypeError(weak));
		byAlgorithm.set(algorithm, key);
	}
	return key;
}

export const verifyParams = (algorithm: JwksAlgorithm) =>
	SPECS[algorithm].verify;
