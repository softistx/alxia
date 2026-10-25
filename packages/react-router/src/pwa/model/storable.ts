/**
 * The content types of the static extensions: scripts, styles, fonts and
 * images (SVG and icons included). A page, JSON or anything else served
 * under a static-looking path is refused all the same.
 */
const STATIC_CONTENT_TYPE =
	/^(?:(?:text|application)\/(?:javascript|x-javascript|ecmascript)|text\/css|font\/[\w.+-]+|application\/(?:font-woff2?|x-font-[\w.+-]+|vnd\.ms-fontobject)|image\/[\w.+-]+)$/i;

/**
 * Whether a response may be stored: a full, same-origin 200 of a static
 * content type, that the server marked `public` (alxia does on every
 * static file it serves; a route answering an image, a user's photo, does
 * not), not private nor no-store, and that does not vary on who asks.
 */
export function isStorable(response: Response): boolean {
	if (response.status !== 200) return false;
	if (response.type !== 'basic' && response.type !== 'default') return false;
	const contentType = (response.headers.get('content-type') ?? '')
		.split(';')[0]
		?.trim();
	if (!contentType || !STATIC_CONTENT_TYPE.test(contentType)) return false;
	const cacheControl = response.headers.get('cache-control') ?? '';
	if (!/\bpublic\b/i.test(cacheControl)) return false;
	if (/\b(?:no-store|private)\b/i.test(cacheControl)) return false;
	const vary = response.headers.get('vary') ?? '';
	return !/(?:^|,)\s*(?:\*|cookie|authorization)\s*(?:,|$)/i.test(vary);
}
