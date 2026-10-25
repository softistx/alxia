import { existsSync } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import type { PrecacheEntry } from '../model/precache-list';
import {
	OFFLINE_URL,
	SERVICE_WORKER_URL,
	type WorkerContract,
} from '../model/worker-contract';
import { PRECACHE_DEFINE } from '../worker/injected';
import { browserManifestFile, revisionOf, workerPrecache } from './precache';

export interface BuildWorkerOptions {
	/**
	 * The worker's source, relative to `root`: `app/service-worker.ts`. Named
	 * `file`, not `entry`: `reveal` reads `alxia({ entry })`.
	 */
	file: string;
	/** `process.cwd()` by default. */
	root?: string;
	/** The client build, relative to `root`: `build/client` by default. */
	client?: string;
	/** Where the worker is written and which offline page is precached. */
	contract?: Pick<WorkerContract, 'serviceWorkerUrl' | 'offlineUrl'>;
	/** Precache the offline page, which must then exist. `true` by default. */
	offline?: boolean;
	/** More files of `assets/` to precache, such as fonts: the app's regex. */
	precacheAssets?: RegExp;
	/** `true` by default. */
	minify?: boolean;
}

export interface WorkerBuild {
	/** The absolute path of the worker written. */
	file: string;
	precache: PrecacheEntry[];
	/** The precached files' size, before compression. */
	precacheBytes: number;
	/** The worker's own size. */
	bytes: number;
}

/** Not `requireBun` of `vite/`: `/pwa/build` imports Node's built-ins only. */
export function assertBun(
	onBun = (globalThis as { Bun?: unknown }).Bun !== undefined,
): void {
	if (onBun) return;
	throw new Error(
		'buildWorker() runs on Bun: it is running on Node. Run it with bun, or run react-router build with bun --bun.',
	);
}

/**
 * The file a root-relative URL names inside `client`. It fails closed: a URL
 * that is absolute, protocol-relative, not rooted at `/`, or that resolves to
 * `client` itself or outside it, is refused.
 */
function urlInClient(client: string, url: string): string {
	const path = join(client, url);
	if (
		!url.startsWith('/') ||
		/^[a-z][a-z0-9+.-]*:|^\/\//i.test(url) ||
		!path.startsWith(client + sep) ||
		path.endsWith(sep)
	) {
		throw new Error(`buildWorker(): ${url} is outside ${client}.`);
	}
	return path;
}

/**
 * Bundles the worker (Workbox included) into the client build, after
 * `react-router build`, with the precache list written in: the offline page
 * by its content, every route's code and `precacheAssets`. A new build
 * changes the list, so the worker's bytes, so the browser installs it.
 * Runs on Bun; the only imports of this module are Node's built-ins.
 */
export async function buildWorker(
	options: BuildWorkerOptions,
): Promise<WorkerBuild> {
	assertBun();
	const root = resolve(options.root ?? process.cwd());
	const client = resolve(root, options.client ?? 'build/client');
	const source = resolve(root, options.file);
	const workerUrl = options.contract?.serviceWorkerUrl ?? SERVICE_WORKER_URL;
	const offlineUrl = options.contract?.offlineUrl ?? OFFLINE_URL;
	if (!existsSync(source)) {
		throw new Error(`buildWorker(): ${options.file} does not exist.`);
	}
	const assets = join(client, 'assets');
	const files = await readdir(assets).catch(() => []);
	const manifest = browserManifestFile(files);
	let offline: PrecacheEntry | undefined;
	if (options.offline !== false) {
		const page = urlInClient(client, offlineUrl);
		if (!existsSync(page)) {
			throw new Error(
				`buildWorker(): ${options.client ?? 'build/client'}${offlineUrl} does not exist. Add public${offlineUrl}, or pass offline: false (\`worker: { offline: false }\` in alxia()), or pass the app's contract (\`worker: { contract }\` in alxia()).`,
			);
		}
		offline = { url: offlineUrl, revision: revisionOf(await readFile(page)) };
	}
	const precache = workerPrecache({
		manifestSource: await readFile(join(assets, manifest), 'utf8'),
		assetFiles: files,
		offline,
		include: options.precacheAssets,
	});
	const out = urlInClient(client, workerUrl);
	const result = await Bun.build({
		entrypoints: [source],
		outdir: dirname(out),
		naming: basename(out),
		target: 'browser',
		format: 'iife',
		minify: options.minify ?? true,
		define: {
			// Workbox's production build: no logging, no dev assertions.
			'process.env.NODE_ENV': '"production"',
			[PRECACHE_DEFINE]: JSON.stringify(precache),
		},
	}).catch((error: unknown) => {
		const detail =
			error instanceof AggregateError
				? error.errors.map(String).join('\n')
				: String(error);
		throw new Error(`buildWorker(): Bun.build failed:\n${detail}`);
	});
	if (!result.success) {
		throw new Error(
			`buildWorker(): Bun.build failed:\n${result.logs.map(String).join('\n')}`,
		);
	}
	let precacheBytes = 0;
	for (const { url } of precache) {
		precacheBytes += (await stat(join(client, url))).size;
	}
	return {
		file: out,
		precache,
		precacheBytes,
		bytes: (await stat(out)).size,
	};
}
