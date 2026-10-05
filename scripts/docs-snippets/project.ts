/** The project a doc's snippets make: `.docs-check/<doc>/`, and the `node_modules` it resolves from. */

import {
	existsSync,
	mkdirSync,
	readdirSync,
	rmSync,
	symlinkSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT } from '../artifacts/packages';
import type { Snippet } from './fences';

export const WORK = join(ROOT, '.docs-check');

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
	for (const dir of readdirSync(join(ROOT, 'packages'))) {
		const manifest = Bun.file(join(ROOT, 'packages', dir, 'package.json'));
		if (!(await manifest.exists())) continue;
		link(join(ROOT, 'packages', dir), (await manifest.json()).name);
	}
	link(join(ROOT, 'node_modules/@types'), '@types');
	for (const dir of readdirSync(join(ROOT, 'packages'))) {
		const installed = join(ROOT, 'packages', dir, 'node_modules');
		if (!existsSync(installed)) continue;
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
					link(join(installed, name, inner), `${name}/${inner}`);
				}
			} else link(join(installed, name), name);
		}
	}
}

export function binOf(name: string): string {
	for (const dir of readdirSync(join(ROOT, 'packages'))) {
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
