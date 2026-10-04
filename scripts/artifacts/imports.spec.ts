import { describe, expect, test } from 'bun:test';
import { packageOf, undeclaredImports } from './imports';

describe('packageOf', () => {
	test('reads a scoped name and a plain one, without the subpath', () => {
		expect(packageOf('@alxia/cache/memory')).toBe('@alxia/cache');
		expect(packageOf('@alxia/cache')).toBe('@alxia/cache');
		expect(packageOf('lodash/fp')).toBe('lodash');
	});
});

describe('undeclaredImports', () => {
	const smtp = { name: '@alxia/i18n' };

	test('refuses a sibling the manifest lists only as a devDependency', () => {
		const manifest = {
			...smtp,
			devDependencies: { '@alxia/cache': 'workspace:^' },
		};
		expect(
			undeclaredImports(manifest, [
				[
					'dist/index.js',
					'import { MemoryCacheStore } from "@alxia/cache";\nexport { MemoryCacheStore };',
				],
			]),
		).toEqual([['dist/index.js', '@alxia/cache']]);
	});

	test('passes the runtime, relative files, chunks and the package itself', () => {
		expect(
			undeclaredImports(smtp, [
				[
					'dist/index.js',
					[
						'import { listen } from "bun";',
						'import { Database } from "bun:sqlite";',
						'import { lookup } from "node:dns";',
						'import { readFileSync } from "fs";',
						'import { reply } from "./chunks/reply-abc.js";',
						'import { x } from "@alxia/i18n/i18n";',
						'export { listen, Database, lookup, readFileSync, reply, x };',
					].join('\n'),
				],
			]),
		).toEqual([]);
	});

	test('passes a peer, a dependency and an optional dependency', () => {
		expect(
			undeclaredImports(
				{
					...smtp,
					peerDependencies: { '@alxia/core': '^0.1.0' },
					dependencies: { a: '1' },
					optionalDependencies: { b: '1' },
				},
				[
					[
						'dist/index.js',
						'import "@alxia/core/build";\nimport "a";\nimport "b/sub";',
					],
				],
			),
		).toEqual([]);
	});

	test("reads a bin past its #! line, which Bun's scanner refuses", () => {
		expect(
			undeclaredImports(smtp, [
				[
					'dist/cli/index.js',
					'#!/usr/bin/env bun\nimport { main } from "../chunks/main-abc.js";\nimport "left-pad";\nmain();',
				],
			]),
		).toEqual([['dist/cli/index.js', 'left-pad']]);
	});

	test('catches a dynamic import, a require and a re-export too', () => {
		expect(
			undeclaredImports(smtp, [
				['dist/a.js', 'export * from "@alxia/cache";'],
				['dist/b.js', 'export const load = () => import("@alxia/redis");'],
				['dist/c.js', 'module.exports = require("@alxia/jwt");'],
			]),
		).toEqual([
			['dist/a.js', '@alxia/cache'],
			['dist/b.js', '@alxia/redis'],
			['dist/c.js', '@alxia/jwt'],
		]);
	});

	test('catches the type-only imports a declaration file holds', () => {
		expect(
			undeclaredImports(smtp, [
				['dist/a.d.ts', "export type { CacheStore } from '@alxia/cache';"],
				[
					'dist/b.d.ts',
					"import type { Job } from '@alxia/redis';\nexport type J = Job;",
				],
				['dist/c.d.ts', "export type R = import('@alxia/jwt').Resolver;"],
				['dist/d.d.ts', "export type { Reply } from './protocol/reply';"],
				['dist/e.d.ts', '/// <reference types="@alxia/janus" />'],
				[
					'dist/f.d.ts',
					"import type { Server } from 'bun';\nexport type S = Server;",
				],
			]),
		).toEqual([
			['dist/a.d.ts', '@alxia/cache'],
			['dist/b.d.ts', '@alxia/redis'],
			['dist/c.d.ts', '@alxia/jwt'],
			['dist/e.d.ts', '@alxia/janus'],
		]);
	});
});
