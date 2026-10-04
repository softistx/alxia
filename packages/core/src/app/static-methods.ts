/**
 * The types of what an app serves from files: `static`, a directory under a
 * path; `file`, one file at a path; `page`, one of Bun's HTML bundles.
 */
import type { AnyReply } from '../reply/reply';
import type { FileOptions, FileSource, StaticOptions } from '../static/types';
import type { PathAt, RoutePath, StaticPath } from '../types/path';
import type { Alxia } from './alxia';
import type { BaseContext, MaybePromise } from './types';

/** `app.static(path, source, options?)`. */
export interface StaticMethod<
	Ctx extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
	/**
	 * A directory of files — or any `FileSource` — served under `path`: a
	 * `GET` route at `path/*`, typed and documented like any other, every
	 * hook around it.
	 *
	 * ```ts
	 * app.static('/assets', './public', {
	 *   cacheControl: (path) => /\.[0-9a-f]{8}\./.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache',
	 *   precompressed: ['br', 'gzip'],
	 * });
	 * app.static('/', './dist', { fallback: 'index.html' }); // a single-page app
	 * ```
	 *
	 * A path that leaves the source, a dotfile, or no file is a 404. ETags
	 * and `Last-Modified` answer 304s; a `Range` a 206.
	 */
	// biome-ignore lint/style/useShorthandFunctionType: a call signature carries its JSDoc to hover and signature help; a function type does not
	<const Path extends RoutePath>(
		path: PathAt<Prefix, Path, StaticPath<Path>>,
		source: FileSource,
		options?: StaticOptions,
	): Alxia<Ctx, Prefix, Shortcuts>;
}

/** `app.file(path, file, options?)`. */
export interface FileMethod<
	Ctx extends object,
	Prefix extends string,
	Shortcuts extends AnyReply,
> {
	/**
	 * One file at `path`: a path on disk, read anew on each request, a `Blob`,
	 * or a function answering one — `null` a 404. `/favicon.ico`,
	 * `/robots.txt`, a generated sitemap.
	 */
	// biome-ignore lint/style/useShorthandFunctionType: a call signature carries its JSDoc to hover and signature help; a function type does not
	<const Path extends RoutePath>(
		path: PathAt<Prefix, Path>,
		file:
			| string
			| Blob
			| ((ctx: BaseContext & Ctx) => MaybePromise<Blob | null | undefined>),
		options?: FileOptions,
	): Alxia<Ctx, Prefix, Shortcuts>;
}

/** `app.page(path, bundle)`. */
export interface PageMethod<Prefix extends string, App> {
	/**
	 * A page of Bun's full-stack bundling: `import index from './index.html'`,
	 * its scripts and styles bundled by Bun — with hot reloading under
	 * `development` — and served by `Bun.serve` itself. So it needs `listen`,
	 * and the app's hooks do not run around it; `app.fetch` answers it 404.
	 */
	// biome-ignore lint/style/useShorthandFunctionType: a call signature carries its JSDoc to hover and signature help; a function type does not
	<const Path extends RoutePath>(
		path: PathAt<Prefix, Path>,
		bundle: Bun.HTMLBundle,
	): App;
}
