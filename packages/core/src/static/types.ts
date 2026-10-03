/** The public types of static files: their sources, options and replies. */
import type { BaseContext, MaybePromise } from '../app/types';
import type { Reply } from '../reply/reply';

/**
 * Where files come from: a directory, or a function answering a path —
 * `Bun.embeddedFiles` in a single-file executable, an S3 bucket through
 * `Bun.s3`, files held in memory. `null` is a 404.
 */
export type FileSource =
	| string
	| ((path: string, ctx: BaseContext) => MaybePromise<Blob | null | undefined>);

/** A content coding a file may be stored in beside itself: `app.js.br`. */
export type Precompressed = 'br' | 'zstd' | 'gzip';

/** What a file, or a directory of them, is served with. */
export interface FileOptions {
	/**
	 * `Cache-Control`: a value, `false` for none, or one per path — long for
	 * hashed assets, none for `index.html`. `public, max-age=0` by default:
	 * the client revalidates, and gets a 304.
	 */
	readonly cacheControl?: string | false | ((path: string) => string | false);
	/** Headers added to every file, or to each by its path. */
	readonly headers?:
		| HeadersInit
		| ((path: string, file: Blob) => HeadersInit | undefined);
	/** A weak `ETag` of its size and modification time, answered 304. On by default. */
	readonly etag?: boolean;
	/** `Last-Modified`, answered 304. On by default. */
	readonly lastModified?: boolean;
	/** `Range` requests, answered 206 — a video seeking. On by default. */
	readonly ranges?: boolean;
	/** Content types by extension, over the ones Bun knows: `{ '.wasm': 'application/wasm' }`. */
	readonly types?: Readonly<Record<string, string>>;
}

export interface StaticOptions extends FileOptions {
	/** The file a directory serves: one, several tried in order, or `false`. `index.html` by default. */
	readonly index?: string | readonly string[] | false;
	/** Extensions tried for a path without one: `['html']` serves `/about` from `about.html`. */
	readonly extensions?: readonly string[];
	/**
	 * Served, with a 200, for a path that matches no file: a single-page
	 * app's `index.html`, relative to the source.
	 */
	readonly fallback?: string;
	/** Whether a file or directory starting with `.` is served. Never, by default: a 404. */
	readonly dotfiles?: boolean;
	/**
	 * Codings stored beside each file, served to a client that accepts them:
	 * `app.js.br` for `app.js`. None by default.
	 */
	readonly precompressed?: readonly Precompressed[];
}

/** The body of the 404. */
export interface FileNotFoundBody {
	readonly error: 'not_found';
}

/** The body of the 416. */
export interface RangeNotSatisfiableBody {
	readonly error: 'range_not_satisfiable';
}

/** Every reply a static route may answer. */
export type StaticReply =
	| Reply<200, Blob>
	| Reply<206, Blob>
	| Reply<304, undefined>
	| Reply<404, FileNotFoundBody>
	| Reply<416, RangeNotSatisfiableBody>;
