/**
 * How a static file becomes a reply: a precompressed copy chosen by
 * `Accept-Encoding`, its headers, and a 304, a 206 or a 416 when the
 * request's conditions and range ask for one.
 */
import { extname } from 'node:path';
import type { BaseContext } from '../app/types';
import { vary } from '../reply/headers';
import { type AnyReply, Reply } from '../reply/reply';
import { fresh, ifRange, parseRange } from './conditional';
import type {
	FileOptions,
	Precompressed,
	RangeNotSatisfiableBody,
} from './types';

/** A file found, and the path it was found at. */
export interface Found {
	readonly file: Blob;
	/** The path it was found at, relative to the source: what options are asked by. */
	readonly path: string;
}

const unsatisfiable: RangeNotSatisfiableBody = {
	error: 'range_not_satisfiable',
};

export async function precompressed(
	found: Found,
	codings: readonly Precompressed[],
	ctx: BaseContext,
	find: (path: string, ctx: BaseContext) => Promise<Blob | undefined>,
): Promise<
	{ readonly file: Blob; readonly coding: Precompressed } | undefined
> {
	if (codings.length === 0) return undefined;
	const accept = ctx.request.headers.get('accept-encoding') ?? '';
	for (const coding of codings) {
		if (
			!new RegExp(`(^|[\\s,])${coding}(?!;q=0(\\.0*)?(\\s|,|$))`).test(accept)
		)
			continue;
		const extension =
			coding === 'gzip' ? 'gz' : coding === 'zstd' ? 'zst' : 'br';
		const file = await find(`${found.path}.${extension}`, ctx);
		if (file !== undefined) return { file, coding };
	}
	return undefined;
}

export function send(
	ctx: BaseContext,
	found: Found,
	options: FileOptions,
	encoded: { readonly file: Blob; readonly coding: Precompressed } | undefined,
	/** Whether a coded copy may be chosen by Accept-Encoding: then even the plain file varies by it. */
	negotiated: boolean,
): AnyReply {
	const { request } = ctx;
	const served = encoded?.file ?? found.file;
	const headers = new Headers();

	const type =
		options.types?.[extname(found.path).toLowerCase()] ?? found.file.type;
	if (type) headers.set('content-type', type);
	if (encoded !== undefined) headers.set('content-encoding', encoded.coding);
	// A coding chosen by Accept-Encoding varies by it, and so does the plain
	// file a client that accepts none gets: a cache must not hand it to one
	// that does.
	if (negotiated) vary(headers, 'Accept-Encoding');

	const cacheControl =
		typeof options.cacheControl === 'function'
			? options.cacheControl(found.path)
			: (options.cacheControl ?? 'public, max-age=0');
	if (cacheControl !== false) headers.set('cache-control', cacheControl);

	const modified =
		'lastModified' in served ? (served as File).lastModified : undefined;
	const etag =
		options.etag !== false && modified !== undefined
			? `W/"${served.size.toString(16)}-${Math.floor(modified).toString(16)}${encoded ? `-${encoded.coding}` : ''}"`
			: undefined;
	if (etag !== undefined) headers.set('etag', etag);
	if (options.lastModified !== false && modified !== undefined) {
		headers.set('last-modified', new Date(modified).toUTCString());
	}
	const ranges = options.ranges !== false && encoded === undefined;
	if (ranges) headers.set('accept-ranges', 'bytes');

	addCustom(
		headers,
		typeof options.headers === 'function'
			? options.headers(found.path, found.file)
			: options.headers,
	);

	if (fresh(request.headers, etag, modified))
		return new Reply(304, undefined, { headers });

	const range = request.headers.get('range');
	if (
		ranges &&
		range !== null &&
		ifRange(request.headers.get('if-range'), etag, modified)
	) {
		const parsed = parseRange(range, served.size);
		if (parsed === 'unsatisfiable') {
			headers.set('content-range', `bytes */${served.size}`);
			return new Reply(416, unsatisfiable, { headers });
		}
		if (parsed !== undefined) {
			headers.set(
				'content-range',
				`bytes ${parsed.start}-${parsed.end}/${served.size}`,
			);
			return new Reply(206, served.slice(parsed.start, parsed.end + 1, type), {
				headers,
			});
		}
	}
	return new Reply(200, served, { headers });
}

/** The `headers` option over the file's own: a cookie is appended, a `Vary` merged. */
function addCustom(headers: Headers, custom: HeadersInit | undefined): void {
	if (custom === undefined) return;
	for (const [name, value] of new Headers(custom)) {
		if (name === 'set-cookie') headers.append(name, value);
		// What the file varies by — Accept-Encoding with precompressed
		// copies — stays, whatever else the option adds.
		else if (name === 'vary') {
			for (const each of value.split(',')) vary(headers, each);
		} else headers.set(name, value);
	}
}
