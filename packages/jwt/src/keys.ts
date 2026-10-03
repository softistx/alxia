import type { Algorithm, JwtOptions, KeyAlgorithm } from './jwt';

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

/** The keys a `Jwt` signs and verifies with: no `sign` without a private key. */
export interface Keys {
	readonly sign?: CryptoKey;
	readonly verify: CryptoKey;
}

const encoder = new TextEncoder();

/**
 * The keys of `options`: an HMAC key imported from the secret, or the key
 * pair as given. Throws at once, not on the first request, on a secret
 * shorter than 32 bytes or a key `algorithm` cannot use.
 */
export function loadKeys(
	options: JwtOptions,
	algorithm: Algorithm,
): Promise<Keys> {
	if ('secret' in options) {
		const secret =
			typeof options.secret === 'string'
				? encoder.encode(options.secret)
				: new Uint8Array(options.secret);
		if (secret.byteLength < 32) {
			throw new TypeError('A JWT secret must hold at least 32 bytes');
		}
		return crypto.subtle
			.importKey(
				'raw',
				secret,
				{ name: 'HMAC', hash: HASH[algorithm] },
				false,
				['sign', 'verify'],
			)
			.then((key) => ({ sign: key, verify: key }));
	}
	checkKey(options.algorithm, 'publicKey', options.publicKey);
	if (options.privateKey !== undefined) {
		checkKey(options.algorithm, 'privateKey', options.privateKey);
	}
	return Promise.resolve(
		options.privateKey === undefined
			? { verify: options.publicKey }
			: { sign: options.privateKey, verify: options.publicKey },
	);
}
