import {
	type Alxia,
	definePlugin,
	type Empty,
	type Plugin,
	type Requiring,
	withHeaders,
} from '@alxia/core';
import { NONCE, type NonceContext, nonceStore, policyWithNonce } from './nonce';

/** A header's value, or `false` to leave it out. An empty value is refused. */
export type Setting = string | false;

export interface SecureHeadersOptions {
	/** Defaults to a policy for an API: nothing loads, nothing frames it. */
	readonly contentSecurityPolicy?: Setting;
	readonly strictTransportSecurity?: Setting;
	readonly xContentTypeOptions?: Setting;
	readonly xFrameOptions?: Setting;
	readonly referrerPolicy?: Setting;
	readonly crossOriginOpenerPolicy?: Setting;
	readonly crossOriginResourcePolicy?: Setting;
	readonly crossOriginEmbedderPolicy?: Setting;
	readonly originAgentCluster?: Setting;
	readonly xDnsPrefetchControl?: Setting;
	readonly xPermittedCrossDomainPolicies?: Setting;
	/** Off by default: a policy is the app's to write. */
	readonly permissionsPolicy?: Setting;
	/** Whether `X-Powered-By` and `Server` are removed. On by default. */
	readonly hidePoweredBy?: boolean;
}

/**
 * The nonce switch, beside `SecureHeadersOptions` rather than in it, so that
 * options typed by that interface still pick the plugin without a nonce.
 */
interface NonceOption {
	/**
	 * A fresh nonce for each request, in `contentSecurityPolicy` and on the
	 * context as `nonce`. Placed where the policy names `NONCE`, or added to
	 * its `script-src`. Off by default.
	 */
	readonly nonce?: boolean;
}

/**
 * What `secureHeaders({ nonce: true })` returns: an app plugin, whose routes
 * after it read `nonce`, and whose hook sets the header with the same one.
 */
export type NoncePlugin = Alxia<NonceContext, '', never> & Requiring<Empty>;

const DEFAULTS = {
	'content-security-policy':
		"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
	'strict-transport-security': 'max-age=31536000; includeSubDomains',
	'x-content-type-options': 'nosniff',
	'x-frame-options': 'DENY',
	'referrer-policy': 'no-referrer',
	'cross-origin-opener-policy': 'same-origin',
	'cross-origin-resource-policy': 'same-origin',
	'cross-origin-embedder-policy': false,
	'origin-agent-cluster': '?1',
	'x-dns-prefetch-control': 'off',
	'x-permitted-cross-domain-policies': 'none',
	'permissions-policy': false,
} as const satisfies Record<string, Setting>;

const OPTION: Record<keyof typeof DEFAULTS, keyof SecureHeadersOptions> = {
	'content-security-policy': 'contentSecurityPolicy',
	'strict-transport-security': 'strictTransportSecurity',
	'x-content-type-options': 'xContentTypeOptions',
	'x-frame-options': 'xFrameOptions',
	'referrer-policy': 'referrerPolicy',
	'cross-origin-opener-policy': 'crossOriginOpenerPolicy',
	'cross-origin-resource-policy': 'crossOriginResourcePolicy',
	'cross-origin-embedder-policy': 'crossOriginEmbedderPolicy',
	'origin-agent-cluster': 'originAgentCluster',
	'x-dns-prefetch-control': 'xDnsPrefetchControl',
	'x-permitted-cross-domain-policies': 'xPermittedCrossDomainPolicies',
	'permissions-policy': 'permissionsPolicy',
};

/**
 * Secure headers on every response, as a plugin. A header a route set
 * itself is kept: a page that needs its own `Content-Security-Policy` —
 * `@alxia/graphql`'s IDE — sets it.
 *
 * ```ts
 * app.plugin(secureHeaders({ contentSecurityPolicy: "default-src 'self'" }));
 * ```
 *
 * With `nonce: true`, each request gets a nonce of its own, in the policy
 * and on the context of the routes declared after it:
 *
 * ```ts
 * app
 *   .plugin(secureHeaders({ nonce: true, contentSecurityPolicy: "script-src 'self'" }))
 *   .get('/', ({ nonce, reply }) => reply(200, `<script nonce="${nonce}">…</script>`));
 * ```
 */
export function secureHeaders(
	options: SecureHeadersOptions & { readonly nonce: true },
): NoncePlugin;
export function secureHeaders(
	options?: SecureHeadersOptions & { readonly nonce?: false },
): Plugin;
export function secureHeaders(
	options: SecureHeadersOptions & NonceOption = {},
): Plugin | NoncePlugin {
	const headers = fixedHeaders(options);
	const hide = options.hidePoweredBy ?? true;
	const policy = headers.get('content-security-policy');
	if (!options.nonce) {
		if (policy?.includes(NONCE)) {
			throw new TypeError(
				'secureHeaders: contentSecurityPolicy names NONCE, but nonce is off: give nonce: true',
			);
		}
		const set = setter(headers, hide);
		return (app) => app.onResponse((response) => set(response));
	}
	if (policy === undefined) {
		throw new TypeError(
			'secureHeaders: nonce is on, but contentSecurityPolicy is false: a nonce is only read through the content-security-policy header',
		);
	}
	headers.delete('content-security-policy');
	const withNonce = policyWithNonce(policy);
	const nonceOf = nonceStore();
	const set = setter(headers, hide);
	const plugin: NoncePlugin = definePlugin()((app) =>
		app
			.onResponse((response, ctx) => set(response, withNonce(nonceOf(ctx.url))))
			.derive(({ url }): NonceContext => ({ nonce: nonceOf(url) })),
	);
	return plugin;
}

/** Each header the options leave in, by name, with its value. Throws on an empty one. */
function fixedHeaders(options: SecureHeadersOptions): Map<string, string> {
	const headers = new Map<string, string>();
	for (const [name, fallback] of Object.entries(DEFAULTS) as [
		keyof typeof DEFAULTS,
		Setting,
	][]) {
		const setting = options[OPTION[name]];
		if (typeof setting === 'string' && setting.trim() === '') {
			// An empty header says nothing a browser can act on: leave it out.
			throw new TypeError(
				`secureHeaders: ${OPTION[name]} is empty; give false to leave the ${name} header out`,
			);
		}
		const value = setting === undefined ? fallback : setting;
		if (typeof value === 'string') headers.set(name, value);
	}
	return headers;
}

/** The `onResponse` hook: every header the response lacks, then the policy given per request. */
function setter(headers: ReadonlyMap<string, string>, hide: boolean) {
	return (response: Response, policy?: string) =>
		withHeaders(response, (current) => {
			for (const [name, value] of headers) {
				if (!current.has(name)) current.set(name, value);
			}
			if (policy !== undefined && !current.has('content-security-policy')) {
				current.set('content-security-policy', policy);
			}
			if (hide) {
				current.delete('x-powered-by');
				current.delete('server');
			}
		});
}
