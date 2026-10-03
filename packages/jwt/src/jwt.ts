import { loadKeys } from './keys';
import { signToken, verifyToken } from './token';

/**
 * JSON Web Tokens on Web Crypto: nothing to install. HMAC with a secret,
 * or ECDSA, RSA and EdDSA with a key pair.
 */

export type HmacAlgorithm = 'HS256' | 'HS384' | 'HS512';
export type KeyAlgorithm =
	| 'ES256'
	| 'ES384'
	| 'RS256'
	| 'RS384'
	| 'RS512'
	| 'EdDSA';
export type Algorithm = HmacAlgorithm | KeyAlgorithm;

/** The claims a token carries. */
export interface JwtClaims {
	readonly iss?: string;
	readonly sub?: string;
	readonly aud?: string | readonly string[];
	readonly exp?: number;
	readonly nbf?: number;
	readonly iat?: number;
	readonly jti?: string;
	readonly [claim: string]: unknown;
}

interface Common {
	/** Checked on verify, set on sign. */
	readonly issuer?: string;
	/** Checked on verify, set on sign: the token must name it. */
	readonly audience?: string;
	/** Seconds a signed token lives. None by default: set one. */
	readonly expiresIn?: number;
	/** Seconds of clock skew allowed on `exp` and `nbf`. 5 by default. */
	readonly clockTolerance?: number;
}

export type JwtOptions = Common &
	(
		| {
				readonly algorithm?: HmacAlgorithm;
				readonly secret: string | Uint8Array;
		  }
		| {
				readonly algorithm: KeyAlgorithm;
				/** Signs: needed by `sign` only. */
				readonly privateKey?: CryptoKey;
				/** Verifies. */
				readonly publicKey: CryptoKey;
		  }
	);

export type VerifyResult =
	| { readonly ok: true; readonly claims: JwtClaims }
	| {
			readonly ok: false;
			readonly reason:
				| 'malformed'
				| 'algorithm'
				| 'signature'
				| 'expired'
				| 'not_yet_valid'
				| 'issuer'
				| 'audience';
	  };

export interface Jwt {
	readonly algorithm: Algorithm;
	/** A token of `claims`, with `iat`, and `exp`, `iss`, `aud` from the options unless given. */
	sign(
		claims: JwtClaims,
		options?: { readonly expiresIn?: number },
	): Promise<string>;
	/** Checks the signature, the algorithm, the times, the issuer and the audience. */
	verify(token: string): Promise<VerifyResult>;
}

/**
 * A signer and verifier of tokens.
 *
 * ```ts
 * const jwt = createJwt({ secret: Bun.env.JWT_SECRET!, issuer: 'api', expiresIn: 3600 });
 * const token = await jwt.sign({ sub: user.id });
 * ```
 */
export function createJwt(options: JwtOptions): Jwt {
	const algorithm: Algorithm = options.algorithm ?? 'HS256';
	const tolerance = options.clockTolerance ?? 5;
	const keys = loadKeys(options, algorithm);
	return {
		algorithm,
		sign: (claims, signOptions) =>
			signToken(
				algorithm,
				keys,
				options,
				claims,
				signOptions?.expiresIn ?? options.expiresIn,
			),
		verify: (token) => verifyToken(algorithm, keys, options, tolerance, token),
	};
}
