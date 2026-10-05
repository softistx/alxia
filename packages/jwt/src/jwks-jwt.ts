import {
	importKey,
	isJwksAlgorithm,
	JWKS_ALGORITHMS,
	selectKey,
	verifyParams,
} from './jwk';
import { keySource, keyUrl } from './jwks';
import type { JwksJwt, JwksOptions, VerifyResult } from './jwt';
import { checkClaims, decodeToken, fail } from './token';

const encoder = new TextEncoder();

/**
 * A verifier by the keys an issuer publishes. The algorithm is never the
 * token's to choose: it must be one of `algorithms`, and fit the kind of
 * the key the `kid` names — an RSA key verifies RS and PS tokens, never an
 * HS one, so a public key used as a secret is refused as `algorithm`.
 */
export function createJwksJwt(options: JwksOptions): JwksJwt {
	const discovery =
		options.discovery === undefined ? undefined : String(options.discovery);
	const source = keySource({
		url: keyUrl(
			options.jwks ?? (options.discovery as string | URL),
			discovery === undefined ? 'jwks' : 'discovery',
		),
		discovery,
		cacheMs: options.cacheMs ?? 600_000,
		staleMs: options.staleMs ?? 86_400_000,
		refetchMs: options.refetchMs ?? 30_000,
		timeoutMs: options.timeoutMs ?? 5_000,
	});
	const allowed = new Set(options.algorithms ?? JWKS_ALGORITHMS);
	const checks = {
		issuer: options.issuer ?? discovery,
		audience: options.audience,
	};
	const tolerance = options.clockTolerance ?? 5;

	async function verify(token: string): Promise<VerifyResult> {
		const decoded = decodeToken(token);
		if (decoded === undefined || decoded.header['crit'] !== undefined)
			return fail('malformed');
		const { alg, kid } = decoded.header;
		if (!isJwksAlgorithm(alg) || !allowed.has(alg)) return fail('algorithm');
		let keys = await source.keys();
		if (keys === undefined) return fail('keys_unavailable');
		let found = selectKey(keys, alg, kid);
		if (found === 'unknown') {
			keys = await source.refresh();
			if (keys === undefined) return fail('keys_unavailable');
			found = selectKey(keys, alg, kid);
		}
		if (found === 'unknown') return fail('key');
		if (found === 'mismatch') return fail('algorithm');
		const key = await importKey(found, alg).catch(() => undefined);
		if (key === undefined) return fail('key');
		const valid = await crypto.subtle
			.verify(
				verifyParams(alg),
				key,
				decoded.signature,
				encoder.encode(decoded.signingInput),
			)
			.catch(() => false);
		if (!valid) return fail('signature');
		const reason = checkClaims(decoded.claims, checks, tolerance);
		return reason === undefined
			? { ok: true, claims: decoded.claims }
			: fail(reason);
	}

	return { verify, refresh: async () => void (await source.refresh()) };
}
