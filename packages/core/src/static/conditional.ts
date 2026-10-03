/**
 * The conditional and range requests of a static file: whether the client's
 * copy is current, whether a range applies to it, and the range asked for.
 */

/** Whether the client's copy is current: `If-None-Match` first, `If-Modified-Since` without it. */
export function fresh(
	headers: Headers,
	etag: string | undefined,
	modified: number | undefined,
): boolean {
	const match = headers.get('if-none-match');
	if (match !== null) {
		if (etag === undefined) return false;
		const weak = (tag: string) => tag.trim().replace(/^W\//, '');
		return match
			.split(',')
			.some((tag) => tag.trim() === '*' || weak(tag) === weak(etag));
	}
	const since = headers.get('if-modified-since');
	if (since === null || modified === undefined) return false;
	const time = Date.parse(since);
	return !Number.isNaN(time) && Math.floor(modified / 1000) * 1000 <= time;
}

/** Whether a range applies: always without `If-Range`, else only to the copy it names. */
export function ifRange(
	value: string | null,
	etag: string | undefined,
	modified: number | undefined,
): boolean {
	if (value === null) return true;
	if (value.startsWith('"') || value.startsWith('W/')) {
		// A weak tag never validates a range.
		return etag !== undefined && !etag.startsWith('W/') && value === etag;
	}
	const time = Date.parse(value);
	return (
		modified !== undefined &&
		!Number.isNaN(time) &&
		Math.floor(modified / 1000) * 1000 <= time
	);
}

/**
 * One byte range of `size`: its first and last byte, `unsatisfiable`, or
 * `undefined` — a header this server ignores, several ranges included —
 * which serves the whole file.
 */
export function parseRange(
	header: string,
	size: number,
):
	| { readonly start: number; readonly end: number }
	| 'unsatisfiable'
	| undefined {
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (match === null) return undefined;
	const [, from = '', to = ''] = match;
	if (from === '' && to === '') return undefined;
	if (from === '') {
		const suffix = Number(to);
		if (suffix === 0) return 'unsatisfiable';
		return { start: Math.max(0, size - suffix), end: size - 1 };
	}
	const start = Number(from);
	const end = to === '' ? size - 1 : Math.min(Number(to), size - 1);
	if (start >= size || start > end) return 'unsatisfiable';
	return { start, end };
}
