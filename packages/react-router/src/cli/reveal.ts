/**
 * `alxia-react-router reveal`: where the server file goes, read cheaply from
 * the app's own config files, and writing it there.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
	basename,
	dirname,
	isAbsolute,
	join,
	relative,
	resolve,
} from 'node:path';
import { NAME } from '../vite/entry';
import { SERVER_FILE } from './template';

const EXTENSIONS = ['.ts', '.mts', '.cts', '.js', '.mjs', '.cjs'];

/** `vite.config.ts`, or the first of its other extensions found in `root`. */
function configFile(root: string, base: string): string | undefined {
	return EXTENSIONS.map((extension) => join(root, `${base}${extension}`)).find(
		(file) => existsSync(file),
	);
}

/** A config file's source, without its comments: Bun's transpiler drops them. */
async function sourceOf(file: string): Promise<string> {
	const loader = /\.[cm]?ts$/.test(file) ? 'ts' : 'js';
	return new Bun.Transpiler({ loader }).transformSync(
		await readFile(file, 'utf8'),
	);
}

/**
 * The string literal given to `key` in `source`; `undefined` when `key` is
 * not there. A `key` given anything else is refused with `computed`.
 */
function literal(
	source: string,
	{ key, value, computed }: { key: RegExp; value: RegExp; computed: string },
): string | undefined {
	const found = source.match(value)?.[2];
	if (found !== undefined) return found;
	if (key.test(source)) throw new Error(computed);
	return undefined;
}

/**
 * The file the plugin would load as the server: `alxia({ entry })`'s, or
 * `server.ts` in React Router's app directory, `app/` unless its config
 * names another. Each is read as a string literal; one computed is refused,
 * since reveal would write a file the plugin does not load.
 */
export async function revealTarget(root: string): Promise<string> {
	const vite = configFile(root, 'vite.config');
	if (vite === undefined) {
		throw new Error(
			`${NAME}: no vite.config.ts in ${root}. Run reveal from the app's root, beside vite.config.ts.`,
		);
	}
	const entry = literal(await sourceOf(vite), {
		key: /\balxia\(\s*\{[^}]*?\bentry\s*:/s,
		value: /\balxia\(\s*\{[^}]*?\bentry\s*:\s*(['"`])([^'"`$]+)\1/s,
		computed: `${NAME}: ${basename(vite)} gives alxia() an entry reveal cannot read. Write it as a string literal, alxia({ entry: 'app/server.ts' }), and run reveal again.`,
	});
	if (entry !== undefined) {
		return isAbsolute(entry) ? entry : resolve(root, entry);
	}
	const rr = configFile(root, 'react-router.config');
	const app =
		(rr === undefined
			? undefined
			: literal(await sourceOf(rr), {
					key: /\bappDirectory\s*:/,
					value: /\bappDirectory\s*:\s*(['"`])([^'"`$]+)\1/,
					computed: `${NAME}: ${basename(rr)} computes appDirectory, which reveal cannot read. Write it as a string literal, appDirectory: 'app', and run reveal again.`,
				})) ?? 'app';
	return resolve(root, app, 'server.ts');
}

export type Revealed =
	| { readonly written: string }
	| { readonly exists: string };

/**
 * Writes the server file into the app at `root`, unless one is already
 * there and `force` is not set. The path comes back relative to `root`.
 */
export async function reveal(root: string, force: boolean): Promise<Revealed> {
	const file = await revealTarget(root);
	const label = relative(root, file);
	if (existsSync(file) && !force) return { exists: label };
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, SERVER_FILE);
	return { written: label };
}
