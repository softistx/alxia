import type { Algorithm, KeyAlgorithm } from './jwt';

/** The hash each algorithm signs with. */
export const HASH: Record<Algorithm, string> = {
	HS256: 'SHA-256',
	HS384: 'SHA-384',
	HS512: 'SHA-512',
	ES256: 'SHA-256',
	ES384: 'SHA-384',
	RS256: 'SHA-256',
	RS384: 'SHA-384',
	RS512: 'SHA-512',
	EdDSA: '',
};

export function params(
	algorithm: Algorithm,
): AlgorithmIdentifier | EcdsaParams {
	if (algorithm.startsWith('HS')) return { name: 'HMAC' };
	if (algorithm.startsWith('ES'))
		return { name: 'ECDSA', hash: HASH[algorithm] };
	if (algorithm.startsWith('RS')) return { name: 'RSASSA-PKCS1-v1_5' };
	return { name: 'Ed25519' };
}

/** The key each algorithm signs with, as Web Crypto names it. */
const KEY: Record<KeyAlgorithm, { name: string; detail?: string }> = {
	ES256: { name: 'ECDSA', detail: 'P-256' },
	ES384: { name: 'ECDSA', detail: 'P-384' },
	RS256: { name: 'RSASSA-PKCS1-v1_5', detail: 'SHA-256' },
	RS384: { name: 'RSASSA-PKCS1-v1_5', detail: 'SHA-384' },
	RS512: { name: 'RSASSA-PKCS1-v1_5', detail: 'SHA-512' },
	EdDSA: { name: 'Ed25519' },
};

const describeKey = (key: CryptoKey): string => {
	const algorithm = key.algorithm as { name: string } & {
		namedCurve?: string;
		hash?: { name: string };
	};
	const detail = algorithm.namedCurve ?? algorithm.hash?.name;
	return detail === undefined ? algorithm.name : `${algorithm.name} ${detail}`;
};

/**
 * Refuses, at once, a key that `algorithm` cannot use: another library
 * would refuse a token signed with a P-384 key under ES256, and a key of the
 * wrong kind would only fail on the first request.
 */
export function checkKey(
	algorithm: KeyAlgorithm,
	role: 'privateKey' | 'publicKey',
	key: CryptoKey,
): void {
	const wanted = KEY[algorithm];
	const expected =
		wanted.detail === undefined
			? wanted.name
			: `${wanted.name} ${wanted.detail}`;
	const actual = describeKey(key);
	if (actual !== expected) {
		throw new TypeError(
			`createJwt: ${algorithm} needs an ${expected} key; the ${role} is ${actual}`,
		);
	}
	const type = role === 'privateKey' ? 'private' : 'public';
	const usage = role === 'privateKey' ? 'sign' : 'verify';
	if (key.type !== type || !key.usages.includes(usage)) {
		throw new TypeError(
			`createJwt: the ${role} must be a ${type} key that can ${usage}; it is a ${key.type} key that can ${key.usages.join(', ') || 'do nothing'}`,
		);
	}
}
