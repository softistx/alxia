/**
 * `trustProxy({ secret })`: a proxy that proves itself with a shared
 * secret in a header, judged without a timing leak. Every accepted value
 * is hashed once at declaration; a request's header is hashed once and
 * compared against all of them, none skipped when one matches.
 */
import { createHash, timingSafeEqual } from 'node:crypto';

/** A header the proxy sets to a secret only it and the app know. */
export interface ProxySecret {
	/** The header's name: not `host`, `forwarded`, nor any `x-forwarded-*`. */
	readonly header: string;
	/** The secret, 16 characters or more (32 random ones are better); a list accepts each during a rotation. */
	readonly value: string | readonly string[];
}

/** What a request's secret header is: the right value, another, or not there. */
export type SecretVerdict = 'right' | 'wrong' | 'absent';

export interface SecretReader {
	/** The header's name, lower case. */
	readonly header: string;
	readonly judge: (headers: Headers) => SecretVerdict;
}

const TOKEN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const MIN_LENGTH = 16;

const digest = (text: string) => createHash('sha256').update(text).digest();

/** `secret` checked once, its values hashed; `reserved` is the forwarding header the app reads. Errors never quote a value. */
export function secretOf(
	option: ProxySecret,
	who: string,
	reserved: string,
): SecretReader {
	if (typeof option !== 'object' || option === null)
		throw new TypeError(
			`${who}: secret must be { header, value }, the header the proxy sets and its value`,
		);
	const { header: written, value } = option;
	const header = typeof written === 'string' ? written.toLowerCase() : '';
	if (!TOKEN.test(header))
		throw new TypeError(`${who}: secret.header must be a valid header name`);
	if (
		header === 'host' ||
		header === 'forwarded' ||
		header.startsWith('x-forwarded-') ||
		header === reserved
	)
		throw new TypeError(
			`${who}: secret.header must not be host, forwarded, an x-forwarded-* header nor the header option`,
		);
	const values = typeof value === 'string' ? [value] : value;
	if (
		!Array.isArray(values) ||
		values.length === 0 ||
		values.some((one) => typeof one !== 'string' || one.length < MIN_LENGTH)
	)
		throw new TypeError(
			`${who}: secret.value must be a string, or a non-empty list of them, of ${MIN_LENGTH} characters or more`,
		);
	if (values.some((one) => one !== one.trim()))
		throw new TypeError(
			`${who}: secret.value must not start or end with a space: a header value is trimmed, so it could never match`,
		);
	const accepted = values.map(digest);
	return {
		header,
		judge(headers) {
			const sent = headers.get(header);
			if (sent === null) return 'absent';
			const hashed = digest(sent);
			let ok = false;
			// Every value is compared: no early exit tells which one matched.
			for (const one of accepted) ok = timingSafeEqual(hashed, one) || ok;
			return ok ? 'right' : 'wrong';
		},
	};
}
