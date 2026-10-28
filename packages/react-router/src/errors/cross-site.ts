/**
 * Whether a request comes from another site: an `Origin` that is not
 * `origin` (the app's own, else the request's), or a `Sec-Fetch-Site` that is
 * neither `same-origin` nor `none`. It reads headers only and imports nothing,
 * so `/subscription` can share it with `/errors` and stay import-free.
 */
export function isCrossSite(request: Request, origin?: string): boolean {
	const own = origin ?? new URL(request.url).origin;
	const from = request.headers.get('origin');
	const site = request.headers.get('sec-fetch-site');
	return Boolean(
		(from && from !== own) ||
			(site && site !== 'same-origin' && site !== 'none'),
	);
}
