/** The project a doc's snippets make: `.docs-check/<doc>/`, and the `node_modules` it resolves from. */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	realpathSync,
	rmSync,
	symlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from '../artifacts/packages';
import type { Snippet } from './fences';

export const WORK = join(ROOT, '.docs-check');

/** A package a member of the workspace installed: `packages/<owner>/node_modules/<name>`. */
export type Install = {
	name: string;
	owner: string;
	path: string;
	/** Its real path: two installs of one copy share it. */
	real: string;
	/** Whether `owner` takes `name` as a peer, so resolves the app's copy. */
	peer: boolean;
};

/**
 * The install each name links to. A name the workspace installed at one copy
 * links to it. One installed at several (a devDependency on graphql 17 beside
 * `@alxia/graphql`'s 16) links to the copy of the package that takes it as a
 * peer: that package resolves it from its own `node_modules`, and a doc that
 * imported another copy would hold two `graphql` modules, whose
 * `GraphQLError`s are not each other's. Two peers on different copies are no
 * one app, and are refused. Ties go to the first owner in name order, never
 * to the order a directory happens to list.
 */
export function linksOf(installs: readonly Install[]): Map<string, string> {
	const byName = new Map<string, Install[]>();
	const sorted = [...installs].sort((a, b) =>
		a.owner < b.owner ? -1 : a.owner > b.owner ? 1 : 0,
	);
	for (const install of sorted) {
		byName.set(install.name, [...(byName.get(install.name) ?? []), install]);
	}
	const links = new Map<string, string>();
	for (const [name, all] of byName) {
		const peers = all.filter((install) => install.peer);
		if (new Set(peers.map((install) => install.real)).size > 1) {
			throw new Error(
				`${name} is installed at several copies by packages that take it as a peer: ${peers
					.map((install) => install.owner)
					.join(', ')}. Align their ranges so one app can hold them.`,
			);
		}
		const chosen = peers[0] ?? all[0];
		if (chosen) links.set(name, chosen.path);
	}
	return links;
}

/** What every member of the workspace installed under its `node_modules`. */
async function installsOf(): Promise<Install[]> {
	const installs: Install[] = [];
	for (const owner of readdirSync(join(ROOT, 'packages')).sort()) {
		const installed = join(ROOT, 'packages', owner, 'node_modules');
		if (!existsSync(installed)) continue;
		const manifest = Bun.file(join(ROOT, 'packages', owner, 'package.json'));
		const peers: Record<string, string> = (await manifest.exists())
			? ((await manifest.json()).peerDependencies ?? {})
			: {};
		const add = (name: string): void => {
			const path = join(installed, name);
			installs.push({
				name,
				owner,
				path,
				real: realpathSync(path),
				peer: name in peers,
			});
		};
		for (const name of readdirSync(installed)) {
			if (
				name.startsWith('.') ||
				name === '@alxia' ||
				name === '@types' ||
				name === 'typescript'
			)
				continue;
			if (name.startsWith('@')) {
				for (const inner of readdirSync(join(installed, name))) {
					add(`${name}/${inner}`);
				}
			} else add(name);
		}
	}
	return installs;
}

/** `.docs-check/node_modules`: the packages of the workspace, and what they installed. */
export async function linkModules(): Promise<void> {
	const modules = join(WORK, 'node_modules');
	rmSync(modules, { recursive: true, force: true });
	mkdirSync(join(modules, '@alxia'), { recursive: true });
	const link = (target: string, name: string): void => {
		const path = join(modules, name);
		if (existsSync(path)) return;
		mkdirSync(dirname(path), { recursive: true });
		symlinkSync(target, path);
	};
	for (const dir of readdirSync(join(ROOT, 'packages')).sort()) {
		const manifest = Bun.file(join(ROOT, 'packages', dir, 'package.json'));
		if (!(await manifest.exists())) continue;
		link(join(ROOT, 'packages', dir), (await manifest.json()).name);
	}
	link(join(ROOT, 'node_modules/@types'), '@types');
	for (const [name, target] of linksOf(await installsOf())) link(target, name);
}

export function binOf(name: string): string {
	for (const dir of readdirSync(join(ROOT, 'packages')).sort()) {
		const bin = join(ROOT, 'packages', dir, 'node_modules/.bin', name);
		if (existsSync(bin)) return bin;
	}
	throw new Error(`${name} is installed in no package: run bun install`);
}

const TSCONFIG = {
	compilerOptions: {
		types: ['bun'],
		lib: ['ESNext', 'DOM'],
		target: 'ESNext',
		module: 'ESNext',
		moduleDetection: 'force',
		moduleResolution: 'bundler',
		verbatimModuleSyntax: true,
		noEmit: true,
		skipLibCheck: true,
		strict: true,
		noImplicitOverride: true,
		noImplicitReturns: true,
		noUncheckedIndexedAccess: true,
		exactOptionalPropertyTypes: true,
		noPropertyAccessFromIndexSignature: true,
		noUnusedLocals: true,
		noUnusedParameters: true,
	},
	include: ['**/*.ts'],
};

/** Writes a doc's files, with a `package.json` and a `tsconfig.json`, into a fresh directory. */
export async function writeProject(
	name: string,
	files: readonly Snippet[],
): Promise<string> {
	const dir = join(WORK, name);
	rmSync(dir, { recursive: true, force: true });
	for (const snippet of files) {
		await Bun.write(join(dir, snippet.file ?? ''), snippet.code);
	}
	await Bun.write(
		join(dir, 'package.json'),
		'{ "private": true, "type": "module" }\n',
	);
	await Bun.write(
		join(dir, 'tsconfig.json'),
		JSON.stringify(TSCONFIG, null, 2),
	);
	return dir;
}
