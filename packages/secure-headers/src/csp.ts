/**
 * `csp`: a `Content-Security-Policy` written as directives, checked once at
 * startup, instead of one long string.
 */

/**
 * A directive's value: its sources; `true` for a bare directive
 * (`upgrade-insecure-requests`); `false` to leave it out.
 */
export type CspValue = readonly string[] | boolean;

/** The directives a policy usually names, for completion. */
export type CspDirectiveName =
	| 'default-src'
	| 'script-src'
	| 'script-src-elem'
	| 'script-src-attr'
	| 'style-src'
	| 'style-src-elem'
	| 'style-src-attr'
	| 'img-src'
	| 'font-src'
	| 'connect-src'
	| 'media-src'
	| 'object-src'
	| 'frame-src'
	| 'child-src'
	| 'worker-src'
	| 'manifest-src'
	| 'base-uri'
	| 'form-action'
	| 'frame-ancestors'
	| 'upgrade-insecure-requests'
	| 'sandbox';

/** A policy's directives: the known names complete, any other name is allowed. */
export type CspDirectives = {
	readonly [K in CspDirectiveName]?: CspValue | undefined;
} & {
	readonly [name: string]: CspValue | undefined;
};

const KEYWORDS = new Set([
	'self',
	'none',
	'unsafe-inline',
	'unsafe-eval',
	'unsafe-hashes',
	'strict-dynamic',
	'wasm-unsafe-eval',
	'report-sample',
	'inline-speculation-rules',
]);

/** A keyword, or a nonce or hash, written without its quotes. */
function isUnquotedKeyword(source: string): boolean {
	const lower = source.toLowerCase();
	return (
		KEYWORDS.has(lower) ||
		/^(nonce|sha256|sha384|sha512)-[a-z0-9+/_-]+=*$/.test(lower)
	);
}

/**
 * The policy, written in insertion order: `name src src; name src`. `NONCE`
 * passes through as it is, for `secureHeaders({ nonce: true })` to replace.
 * Throws a `TypeError` at startup on a policy a browser would misread, such
 * as a keyword written without its quotes (`self` for `'self'`).
 *
 * ```ts
 * secureHeaders({
 *   nonce: true,
 *   contentSecurityPolicy: csp({
 *     'default-src': ["'self'"],
 *     'script-src': ["'self'", NONCE],
 *     'upgrade-insecure-requests': true,
 *   }),
 * });
 * ```
 */
export function csp(directives: CspDirectives): string {
	const written: string[] = [];
	for (const [name, value] of Object.entries(directives)) {
		if (!/^[a-z][a-z0-9-]*$/.test(name)) {
			throw new TypeError(
				`csp(): "${name}" is not a directive name: write lowercase letters, digits and hyphens, starting with a letter, as in "script-src"`,
			);
		}
		if (value === undefined || value === false) continue;
		if (value === true) {
			written.push(name);
			continue;
		}
		if (value.length === 0) {
			throw new TypeError(
				`csp(): ${name} has no source: write ["'none'"] to allow nothing, or false to leave it out`,
			);
		}
		for (const source of value) {
			if (/[;,\s]/.test(source) || source === '') {
				throw new TypeError(
					`csp(): ${name} has the source "${source}", which is empty or holds ";", "," or a space: a source is one token, so split a list into several sources, and write a comma inside a URL as %2C`,
				);
			}
		}
		for (const source of value) {
			if (isUnquotedKeyword(source)) {
				throw new TypeError(
					`csp(): ${source} in ${name} is a keyword: write it quoted, '${source}'`,
				);
			}
		}
		written.push(`${name} ${value.join(' ')}`);
	}
	if (written.length === 0) {
		throw new TypeError(
			'csp(): no directive is left: give at least one, such as { "default-src": ["\'none\'"] }',
		);
	}
	return written.join('; ');
}
