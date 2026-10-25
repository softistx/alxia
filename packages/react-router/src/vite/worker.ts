/**
 * The service worker, built by `alxia()` once React Router has built the
 * client: `app/service-worker.ts` is the opt-in, as `app/server.ts` is.
 */
import { existsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import type { ResolvedConfig } from 'vite';
import { type BuildWorkerOptions, buildWorker } from '../pwa/build';
import { contextOf } from './config';
import { NAME } from './entry';
import type { AlxiaOptions } from './index';
import { requireBun } from './runtime';

/** `buildWorker()`'s options but where: the plugin knows the root, the client build and, by default, the file. */
export type AlxiaWorkerOptions = Omit<
	BuildWorkerOptions,
	'root' | 'client' | 'file'
> & { readonly file?: string };

/**
 * The worker's source, absolute, or `undefined` when there is none to
 * build: `worker: false`, or no `app/service-worker.ts` and no named file.
 * Throws when a named file does not exist.
 */
export function workerFile(
	option: AlxiaOptions['worker'],
	config: ResolvedConfig,
): string | undefined {
	if (option === false) return undefined;
	const named = typeof option === 'string' ? option : option?.file;
	if (named !== undefined) {
		const file = isAbsolute(named) ? named : resolve(config.root, named);
		if (!existsSync(file)) {
			throw new Error(
				`${NAME}: the worker ${named} does not exist. Create it, or leave worker out to build app/service-worker.ts when it exists.`,
			);
		}
		return file;
	}
	const file = join(contextOf(config).appDirectory, 'service-worker.ts');
	return existsSync(file) ? file : undefined;
}

const MB = (bytes: number) => (bytes / 1024 / 1024).toFixed(2);
const KB = (bytes: number) => (bytes / 1024).toFixed(1);

/** Builds the worker into `build/client`, if the app has one. */
export async function buildAppWorker(
	config: ResolvedConfig,
	option: AlxiaOptions['worker'],
): Promise<void> {
	const file = workerFile(option, config);
	if (file === undefined) return;
	requireBun(
		'react-router build with a service worker',
		'bun --bun react-router build',
	);
	const rest = typeof option === 'object' ? option : {};
	const built = await buildWorker({
		...rest,
		file,
		root: config.root,
		client: join(contextOf(config).buildDirectory, 'client'),
	});
	config.logger.info(
		`✓ service-worker.js: ${built.precache.length} files precached (${MB(built.precacheBytes)} MB), worker ${KB(built.bytes)} kB`,
	);
}
