import { type Fetched, getJson } from './fetch';
import { isLocal, keyUrl } from './url';

/** The `jwks_uri` of an issuer's OpenID configuration, which must name that issuer. */
export async function jwksUri(
	issuer: string,
	timeoutMs: number,
	get: (url: URL, timeoutMs: number) => Promise<Fetched> = getJson,
): Promise<URL> {
	const base = issuer.replace(/\/$/, '');
	const { body } = await get(
		new URL(`${base}/.well-known/openid-configuration`),
		timeoutMs,
	);
	const document = body as { issuer?: unknown; jwks_uri?: unknown };
	if (document.issuer !== issuer) {
		throw new Error(
			`the discovery document names the issuer ${String(document.issuer)}`,
		);
	}
	if (typeof document.jwks_uri !== 'string')
		throw new Error('the discovery document has no jwks_uri');
	// Read from a remote document, so never a URL on this machine, unless the issuer is.
	return keyUrl(document.jwks_uri, 'jwks_uri', isLocal(issuer));
}
