import { Duplex } from 'node:stream';
import { constants, createBrotliCompress } from 'node:zlib';
import {
	defineMiddleware,
	type Empty,
	type Middleware,
	settle,
	vary,
	withHeaders,
} from '@alxia/core';
import { BROTLI_QUALITY, flushing } from './flushing';

export type Encoding = 'zstd' | 'br' | 'gzip' | 'deflate';

export interface CompressOptions {
	/** The encodings offered, in the server's order of preference. */
	readonly encodings?: readonly Encoding[];
	/** Bodies smaller than this, in bytes, are sent as they are. 1 KiB by default. */
	readonly threshold?: number;
	/** Whether a `content-type` is worth compressing. Text, JSON, JavaScript, XML and SVG by default. */
	readonly compressible?: (type: string) => boolean;
}

/** What `compress()` makes: a middleware that adds nothing to the context. */
export type CompressMiddleware = Middleware<Empty, Promise<Response>>;

const COMPRESSIBLE =
	/^(text\/(?!event-stream)|application\/(.+\+)?(json|javascript|xml)|image\/svg\+xml)/i;

/**
 * Compression, as a middleware: each response worth it — every one the
 * routes after it and a request no route matches answer, an error's
 * included — is streamed through the
 * best encoding both sides accept — zstd, Brotli, gzip or deflate — with
 * Bun's and Node's own codecs. A body with no `Content-Length` is flushed
 * as it comes, so a streamed page's shell leaves before its stream ends. An
 * event stream is left alone by default: `compressible` can opt it in, and
 * each event is then flushed in the same way.
 *
 * ```ts
 * app.use(compress());
 * ```
 */
export function compress(options: CompressOptions = {}): CompressMiddleware {
	const settings: Settings = {
		encodings: options.encodings ?? ['zstd', 'br', 'gzip', 'deflate'],
		threshold: options.threshold ?? 1024,
		compressible: options.compressible ?? ((type) => COMPRESSIBLE.test(type)),
	};
	return defineMiddleware(async (ctx, next) =>
		compressed(await settle(ctx, next()), ctx.request, settings),
	);
}

interface Settings {
	readonly encodings: readonly Encoding[];
	readonly threshold: number;
	readonly compressible: (type: string) => boolean;
}

/** `response`, encoded for `request` when it is worth it; as it is otherwise. */
function compressed(
	given: Response,
	request: Request,
	{ encodings, threshold, compressible }: Settings,
): Response {
	const type = given.headers.get('content-type') ?? '';
	const response = compressible(type)
		? withHeaders(given, (headers) => vary(headers, 'Accept-Encoding'))
		: given;
	if (
		response.body === null ||
		request.method === 'HEAD' ||
		response.headers.has('content-encoding') ||
		response.status === 204 ||
		response.status === 206 ||
		response.status === 304 ||
		/\bno-transform\b/.test(response.headers.get('cache-control') ?? '') ||
		!compressible(type)
	) {
		return response;
	}
	const length = response.headers.get('content-length');
	if (length !== null && Number(length) < threshold) return response;
	const encoding = negotiate(request.headers.get('accept-encoding'), encodings);
	if (encoding === undefined) return response;
	const headers = new Headers(response.headers);
	headers.set('content-encoding', encoding);
	headers.delete('content-length');
	// A range of the encoded body is not a range of the file.
	headers.delete('accept-ranges');
	const etag = headers.get('etag');
	if (etag !== null && !etag.startsWith('W/')) headers.set('etag', `W/${etag}`);
	// A body with no length is a stream: flushed as it comes, so a
	// streamed page or an event leaves at once. One with a length is
	// compressed whole, which compresses better.
	const body =
		length === null
			? flushing(response.body, encoding)
			: response.body.pipeThrough(compressor(encoding));
	return new Response(body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	});
}

function compressor(
	encoding: Encoding,
): ReadableWritablePair<Uint8Array, Uint8Array> {
	if (encoding === 'br') {
		return Duplex.toWeb(
			createBrotliCompress({
				params: { [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY },
			}),
		) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
	}
	return new CompressionStream(
		encoding as CompressionFormat,
	) as unknown as ReadableWritablePair<Uint8Array, Uint8Array>;
}

/**
 * The encoding to answer `accept` with: the first of `offered` the client
 * accepts, by its own `q` order first. `identity` alone, or nothing, is none.
 */
export function negotiate(
	accept: string | null,
	offered: readonly Encoding[],
): Encoding | undefined {
	if (accept === null) return undefined;
	const weights = new Map<string, number>();
	for (const part of accept.split(',')) {
		const [name, ...params] = part.trim().toLowerCase().split(';');
		if (!name) continue;
		const q = params
			.map((param) => param.trim())
			.find((param) => param.startsWith('q='));
		weights.set(name, q === undefined ? 1 : Number(q.slice(2)) || 0);
	}
	const weight = (encoding: string) =>
		weights.get(encoding) ?? weights.get('*') ?? 0;
	let best: Encoding | undefined;
	for (const encoding of offered) {
		if (weight(encoding) <= 0) continue;
		if (best === undefined || weight(encoding) > weight(best)) best = encoding;
	}
	return best;
}
