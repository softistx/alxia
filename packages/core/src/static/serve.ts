/**
 * Static files, served through the app's pipeline: every hook runs around
 * them, and the client types them like any route.
 */
import { extname, resolve, sep } from 'node:path';
import type { BaseContext, MaybePromise } from '../app/types';
import { type AnyReply, Reply } from '../reply/reply';
import { type Found, precompressed, send } from './send';
import type {
	FileNotFoundBody,
	FileOptions,
	FileSource,
	StaticOptions,
} from './types';

const notFound: FileNotFoundBody = { error: 'not_found' };

/** A source as a lookup of one relative path. */
function lookup(source: FileSource) {
	if (typeof source === 'function') {
		return async (path: string, ctx: BaseContext) => {
			const file = await source(path, ctx);
			return file ? file : undefined;
		};
	}
	const root = resolve(source);
	return async (path: string): Promise<Blob | undefined> => {
		const full = resolve(root, path);
		if (full !== root && !full.startsWith(root + sep)) return undefined;
		const file = Bun.file(full);
		return (await file.exists()) ? file : undefined;
	};
}

/** The segments of a requested path, or `undefined` for one that must never be served. */
function segmentsOf(wanted: string, dotfiles: boolean): string[] | undefined {
	if (wanted.includes('\0') || wanted.includes('\\')) return undefined;
	const segments = wanted.split('/').filter((segment) => segment !== '');
	if (segments.some((segment) => segment === '..' || segment === '.'))
		return undefined;
	if (!dotfiles && segments.some((segment) => segment.startsWith('.')))
		return undefined;
	return segments;
}

/** The handler of `app.static`: the wildcard's path, looked up in `source`. */
export function staticHandler(source: FileSource, options: StaticOptions = {}) {
	const find = lookup(source);
	const indexes =
		options.index === false
			? []
			: typeof options.index === 'string'
				? [options.index]
				: (options.index ?? ['index.html']);
	const extensions = options.extensions ?? [];
	const dotfiles = options.dotfiles ?? false;

	const locate = async (
		wanted: string,
		ctx: BaseContext,
	): Promise<Found | undefined> => {
		const segments = segmentsOf(wanted, dotfiles);
		if (segments === undefined) return undefined;
		const path = segments.join('/');
		const candidates = [path];
		if (path !== '' && extname(path) === '') {
			candidates.push(
				...extensions.map(
					(extension) => `${path}.${extension.replace(/^\./, '')}`,
				),
			);
		}
		candidates.push(
			...indexes.map((index) => (path === '' ? index : `${path}/${index}`)),
		);
		for (const candidate of candidates) {
			if (candidate === '') continue;
			const file = await find(candidate, ctx);
			if (file !== undefined) return { file, path: candidate };
		}
		return undefined;
	};

	return async (ctx: BaseContext): Promise<AnyReply> => {
		const wanted = ctx.pathParams['*'] ?? '';
		const found =
			(await locate(wanted, ctx)) ??
			(options.fallback === undefined
				? undefined
				: await locate(options.fallback, ctx));
		if (found === undefined) return new Reply(404, notFound);
		const encoded = await precompressed(
			found,
			options.precompressed ?? [],
			ctx,
			find,
		);
		return send(
			ctx,
			found,
			options,
			encoded,
			(options.precompressed?.length ?? 0) > 0,
		);
	};
}

/** The handler of `app.file`: one file, read anew on every request so a change is served. */
export function fileHandler(
	file:
		| string
		| Blob
		| ((ctx: BaseContext) => MaybePromise<Blob | null | undefined>),
	options: FileOptions = {},
) {
	return async (ctx: BaseContext): Promise<AnyReply> => {
		const blob =
			typeof file === 'string'
				? Bun.file(file)
				: typeof file === 'function'
					? await file(ctx)
					: file;
		if (!blob || (isBunFile(blob) && !(await blob.exists()))) {
			return new Reply(404, notFound);
		}
		const path =
			typeof file === 'string'
				? file
				: ((isBunFile(blob) ? blob.name : undefined) ?? ctx.route);
		return send(ctx, { file: blob, path }, options, undefined, false);
	};
}

function isBunFile(blob: Blob): blob is Bun.BunFile {
	return typeof (blob as Bun.BunFile).exists === 'function';
}
