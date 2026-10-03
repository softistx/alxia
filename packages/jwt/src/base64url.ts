/** The URL-safe Base64 of `bytes`, without padding, as a JWT writes it. */
export function base64url(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString('base64url');
}

/** The bytes of URL-safe Base64 `text`; throws on any other character. */
export function fromBase64url(text: string): Uint8Array<ArrayBuffer> {
	if (!/^[A-Za-z0-9_-]*$/.test(text)) throw new TypeError('not base64url');
	return new Uint8Array(Buffer.from(text, 'base64url'));
}
