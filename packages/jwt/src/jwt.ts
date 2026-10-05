import type { JwksAlgorithm } from './jwk';
import { createJwksJwt } from './jwks-jwt';
import { loadKeys } from './keys';
import { signToken, type TokenContext, verifyToken } from './token';

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
				| 'audience'
				/** JWKS only: no key for the token's `kid`, or none it may use. */
				| 'key'
				/** JWKS only: the issuer's keys cannot be had and none is cached within the grace period. */
				| 'keys_unavailable';
	  };

/** What checks a token: a `Jwt`, or one that verifies by a key set. */
export interface Verifier {
	/** Checks the signature, the algorithm, the times, the issuer and the audience. */
	verify(token: string): Promise<VerifyResult>;
}

/** A verifier of tokens signed with the keys an issuer publishes as a JWKS; it cannot sign. */
export interface JwksJwt extends Verifier {
	/** Fetches the key set now, unless one was tried within `refetchMs`: warm the cache at startup. */
	refresh(): Promise<void>;
}

/** Options of `createJwt` that verify by a JWKS: Keycloak, Auth0, Ory, Cognito. */
export type JwksOptions = Pick<
	Common,
	'issuer' | 'audience' | 'clockTolerance'
> & {
	/** Seconds-free cache lifetime in milliseconds when the response has no `Cache-Control: max-age`. 600 000 by default. */
	readonly cacheMs?: number;
	/** Milliseconds a set past its lifetime stays usable while the issuer cannot be reached. 86 400 000 by default; 0 fails closed at once. */
	readonly staleMs?: number;
	/** The shortest time between two fetches, failures included. 30 000 by default. */
	readonly refetchMs?: number;
	/** Milliseconds a fetch may take. 5 000 by default. */
	readonly timeoutMs?: number;
	/** The algorithms accepted, from the asymmetric ones Web Crypto supports; all of them by default. */
	readonly algorithms?: readonly JwksAlgorithm[];
} & (
		| {
				/** The key set's URL, `https` (or `http` on localhost). */
				readonly jwks: string | URL;
				readonly discovery?: undefined;
		  }
		| {
				/**
				 * An issuer URL: the set's URL is the `jwks_uri` of its
				 * `/.well-known/openid-configuration`, which must name that issuer,
				 * and `issuer` defaults to it.
				 */
				readonly discovery: string | URL;
				readonly jwks?: undefined;
		  }
	);

export interface Jwt extends Verifier {
	readonly algorithm: Algorithm;
	/** A token of `claims`, with `iat`, and `exp`, `iss`, `aud` from the options unless given. */
	sign(
		claims: JwtClaims,
		options?: { readonly expiresIn?: number },
	): Promise<string>;
}

/**
 * A signer and verifier of tokens.
 *
 * ```ts
 * const jwt = createJwt({ secret: Bun.env.JWT_SECRET!, issuer: 'api', expiresIn: 3600 });
 * const token = await jwt.sign({ sub: user.id });
 * ```
 */
export function createJwt(options: JwksOptions): JwksJwt;
export function createJwt(options: JwtOptions): Jwt;
export function createJwt(options: JwtOptions | JwksOptions): Jwt | JwksJwt {
	if ('jwks' in options || 'discovery' in options)
		return createJwksJwt(options);
	const algorithm: Algorithm = options.algorithm ?? 'HS256';
	const context: TokenContext = {
		algorithm,
		keys: loadKeys(options, algorithm),
		options,
		tolerance: options.clockTolerance ?? 5,
	};
	return {
		algorithm,
		sign: (claims, signOptions) =>
			signToken(context, claims, signOptions?.expiresIn ?? options.expiresIn),
		verify: (token) => verifyToken(context, token),
	};
}
