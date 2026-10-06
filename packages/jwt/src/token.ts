import { base64url, fromBase64url } from './base64url';
import type { Algorithm, JwtClaims, JwtOptions, VerifyResult } from './jwt';
import { type Keys, params } from './keys';
import { signatureFits } from './signature';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** What a `Jwt` signs and verifies with, fixed when it is created. */
export interface TokenContext {
	readonly algorithm: Algorithm;
	readonly keys: Promise<Keys>;
	readonly options: JwtOptions;
	/** Seconds of clock skew allowed on `exp` and `nbf`. */
	readonly tolerance: number;
}

export type Failure = Extract<VerifyResult, { ok: false }>;
export type Reason = Failure['reason'];

export const fail = (reason: Reason): Failure => ({ ok: false, reason });

const isObject = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

/** A token of `claims`, with `iat`, and `exp`, `iss`, `aud` from the options unless given. */
export async function signToken(
	{ algorithm, keys, options }: TokenContext,
	claims: JwtClaims,
	expiresIn: number | undefined,
): Promise<string> {
	const key = (await keys).sign;
	if (key === undefined) throw new TypeError('Signing needs a private key');
	const now = Math.floor(Date.now() / 1000);
	const payload: Record<string, unknown> = {
		iat: now,
		...(options.issuer === undefined ? {} : { iss: options.issuer }),
		...(options.audience === undefined ? {} : { aud: options.audience }),
		...(expiresIn === undefined ? {} : { exp: now + expiresIn }),
		...claims,
	};
	const head = base64url(
		encoder.encode(JSON.stringify({ alg: algorithm, typ: 'JWT' })),
	);
	const body = base64url(encoder.encode(JSON.stringify(payload)));
	const signature = await crypto.subtle.sign(
		params(algorithm),
		key,
		encoder.encode(`${head}.${body}`),
	);
	return `${head}.${body}.${base64url(new Uint8Array(signature))}`;
}

export interface Decoded {
	readonly header: Record<string, unknown>;
	readonly claims: JwtClaims;
	/** The signing input, `head.body`: the text the signature covers. */
	readonly signingInput: string;
	readonly signature: Uint8Array<ArrayBuffer>;
}

/** The three parts of `token`, or `undefined` when it is not a JWT of two JSON objects. */
export function decodeToken(token: string): Decoded | undefined {
	const parts = token.split('.');
	if (parts.length !== 3) return undefined;
	const [head, body, signature] = parts as [string, string, string];
	let header: unknown;
	let claims: unknown;
	let signed: Uint8Array<ArrayBuffer>;
	try {
		header = JSON.parse(decoder.decode(fromBase64url(head)));
		claims = JSON.parse(decoder.decode(fromBase64url(body)));
		signed = fromBase64url(signature);
	} catch {
		return undefined;
	}
	if (!isObject(claims) || !isObject(header)) return undefined;
	return {
		header,
		claims: claims as JwtClaims,
		signingInput: `${head}.${body}`,
		signature: signed,
	};
}

/** Why `claims` are refused at `now`, or `undefined` when their times, issuer and audience hold. */
export function checkClaims(
	claims: JwtClaims,
	options: {
		readonly issuer?: string | undefined;
		readonly audience?: string | undefined;
	},
	tolerance: number,
): Reason | undefined {
	const now = Math.floor(Date.now() / 1000);
	if (typeof claims.exp === 'number' && now - tolerance >= claims.exp) {
		return 'expired';
	}
	if (typeof claims.nbf === 'number' && now + tolerance < claims.nbf) {
		return 'not_yet_valid';
	}
	if (options.issuer !== undefined && claims.iss !== options.issuer) {
		return 'issuer';
	}
	if (options.audience !== undefined) {
		const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
		if (!audiences.includes(options.audience)) return 'audience';
	}
	return undefined;
}

/** Checks the signature, the algorithm, the times, the issuer and the audience. */
export async function verifyToken(
	{ algorithm, keys, options, tolerance }: TokenContext,
	token: string,
): Promise<VerifyResult> {
	const decoded = decodeToken(token);
	// No extension is understood, so one the token marks critical is refused (RFC 7515, 4.1.11).
	if (decoded === undefined || decoded.header['crit'] !== undefined)
		return fail('malformed');
	if (decoded.header['alg'] !== algorithm) return fail('algorithm');
	if (!signatureFits(algorithm, decoded.signature)) return fail('signature');
	// A signature Web Crypto cannot read — the wrong length for the
	// curve — is a bad signature, not an error to answer with a 500.
	const valid = await crypto.subtle
		.verify(
			params(algorithm),
			(await keys).verify,
			decoded.signature,
			encoder.encode(decoded.signingInput),
		)
		.catch(() => false);
	if (!valid) return fail('signature');
	const reason = checkClaims(decoded.claims, options, tolerance);
	return reason === undefined
		? { ok: true, claims: decoded.claims }
		: fail(reason);
}
