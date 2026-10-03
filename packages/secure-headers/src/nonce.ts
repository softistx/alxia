/**
 * The per-request nonce of `secureHeaders({ nonce: true })`: where it goes
 * in the policy, how one is made, and how the context and the header read
 * the same one.
 */

/**
 * Where the nonce goes in `contentSecurityPolicy`: each occurrence becomes
 * `'nonce-<value>'`, the request's own value. Without it, `nonce: true`
 * adds the nonce to `script-src` and `script-src-elem`.
 *
 * ```ts
 * secureHeaders({
 *   nonce: true,
 *   contentSecurityPolicy: `default-src 'self'; style-src 'self' ${NONCE}`,
 * });
 * ```
 */
export const NONCE = "'nonce-{alxia}'";

/** What `secureHeaders({ nonce: true })` adds to the context of the routes after it. */
export interface NonceContext {
	/**
	 * This request's nonce, base64, the one its `Content-Security-Policy`
	 * allows: what a page puts on its `<script nonce>`.
	 */
	readonly nonce: string;
}

/** The directives the nonce is added to when the policy does not place it. */
const SCRIPT_DIRECTIVES = new Set(['script-src', 'script-src-elem']);

/**
 * The policy as a function of the nonce: split where `NONCE` stands, or
 * where it is added to the script directives. Throws when there is
 * nowhere to put it.
 */
export function policyWithNonce(policy: string): (nonce: string) => string {
	const placed = policy.includes(NONCE)
		? policy
		: policy
				.split(';')
				.map((directive) => {
					const name = directive.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
					return SCRIPT_DIRECTIVES.has(name)
						? `${directive.trimEnd()} ${NONCE}`
						: directive;
				})
				.join(';');
	if (!placed.includes(NONCE)) {
		throw new TypeError(
			`secureHeaders: nonce is on, but the content-security-policy has no script-src to add it to: write one, or place NONCE where the nonce goes (the policy is "${policy}")`,
		);
	}
	const parts = placed.split(NONCE);
	return (nonce) => parts.join(`'nonce-${nonce}'`);
}

/** 128 random bits, base64: a fresh nonce. */
export function freshNonce(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(16));
	return btoa(String.fromCharCode(...bytes));
}

/**
 * One nonce per request, made when first asked for. Keyed by the request's
 * `URL`: the one object every hook and the route of a request share, where
 * a `bodyLimit` hands the route a `Request` of its own.
 */
export function nonceStore(): (url: URL) => string {
	const nonces = new WeakMap<URL, string>();
	return (url) => {
		let nonce = nonces.get(url);
		if (nonce === undefined) {
			nonce = freshNonce();
			nonces.set(url, nonce);
		}
		return nonce;
	};
}
