import { base64url, fromBase64url } from './base64url';
import type { Algorithm, JwtClaims, JwtOptions, VerifyResult } from './jwt';
import { type Keys, params } from './keys';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

type Failure = Extract<VerifyResult, { ok: false }>;
type Reason = Failure['reason'];

const fail = (reason: Reason): Failure => ({ ok: false, reason });

const isObject = (value: unknown): value is Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value);

/** A token of `claims`, with `iat`, and `exp`, `iss`, `aud` from the options unless given. */
export async function signToken(
	algorithm: Algorithm,
	keys: Promise<Keys>,
	options: JwtOptions,
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

interface Decoded {
	readonly header: Record<string, unknown>;
	readonly claims: JwtClaims;
	/** The bytes the signature covers: `head.body`. */
	readonly content: string;
	readonly signature: Uint8Array<ArrayBuffer>;
}

/** The three parts of `token`, or `undefined` when it is not a JWT of two JSON objects. */
function decodeToken(token: string): Decoded | undefined {
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
		content: `${head}.${body}`,
		signature: signed,
	};
}

/** Why `claims` are refused at `now`, or `undefined` when their times, issuer and audience hold. */
function checkClaims(
	claims: JwtClaims,
	options: JwtOptions,
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
	algorithm: Algorithm,
	keys: Promise<Keys>,
	options: JwtOptions,
	tolerance: number,
	token: string,
): Promise<VerifyResult> {
	const decoded = decodeToken(token);
	if (decoded === undefined) return fail('malformed');
	if (decoded.header['alg'] !== algorithm) return fail('algorithm');
	// A signature Web Crypto cannot read — the wrong length for the
	// curve — is a bad signature, not an error to answer with a 500.
	const valid = await crypto.subtle
		.verify(
			params(algorithm),
			(await keys).verify,
			decoded.signature,
			encoder.encode(decoded.content),
		)
		.catch(() => false);
	if (!valid) return fail('signature');
	const reason = checkClaims(decoded.claims, options, tolerance);
	return reason === undefined
		? { ok: true, claims: decoded.claims }
		: fail(reason);
}
