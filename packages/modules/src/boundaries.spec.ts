import { describe, expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertBoundaries, boundaryViolations, importsOf } from './boundaries';
import { defineModule } from './module';

const registry = [
	defineModule({ name: 'pricing' }),
	defineModule({ name: 'sales', dependsOn: ['pricing'] }),
	defineModule({ name: 'reports' }),
];
const at = (path: string) => `/app/src/modules/${path}`;
const options = { modulesRoot: '/app/src/modules', surface: 'public' };
const check = (files: Record<string, string>) =>
	boundaryViolations(files, registry, options);

describe('importsOf', () => {
	test('sees plain, type-only, re-exported, side-effect and dynamic imports', () => {
		const text = [
			'import a from "./a";',
			'import type { T } from "./b";',
			'export { c } from "./c";',
			'export type { D } from "./d";',
			'import "./e";',
			'const f = await import("./f");',
			'import { type G } from "g";',
		].join('\n');
		expect(importsOf(text).sort()).toEqual(
			['./a', './b', './c', './d', './e', './f', 'g'].sort(),
		);
	});
});

describe('boundaryViolations', () => {
	test('passes a module using its own files and a declared public surface', () => {
		expect(
			check({
				[at('sales/a.ts')]:
					'import "./b"; import "../pricing/public"; import "../shared/x";',
			}),
		).toEqual([]);
	});

	test('flags a module reaching inside another', () => {
		const [found] = check({
			[at('sales/a.ts')]: 'import "../pricing/prices";',
		});
		expect(found?.rule).toBe('only via public.ts');
	});

	test('flags a type-only import of an internal', () => {
		expect(
			check({
				[at('sales/a.ts')]: 'import type { P } from "../pricing/model";',
			}),
		).toHaveLength(1);
	});

	test('flags the public surface of a module not in dependsOn', () => {
		const [found] = check({
			[at('sales/a.ts')]: 'import "../reports/public";',
		});
		expect(found?.rule).toBe('not in dependsOn');
	});

	test('skips spec files and folders that are not modules', () => {
		expect(
			check({
				[at('sales/a.spec.ts')]: 'import "../reports/internal";',
				[at('shared/x.ts')]: 'import "../sales/internal";',
			}),
		).toEqual([]);
	});
});

describe('assertBoundaries', () => {
	const project = async (files: Record<string, string>) => {
		const root = await mkdtemp(join(tmpdir(), 'alxia-modules-'));
		for (const [path, text] of Object.entries(files)) {
			await mkdir(join(root, path, '..'), { recursive: true });
			await writeFile(join(root, path), text);
		}
		return root;
	};

	test('passes a clean project', async () => {
		const root = await project({
			'src/modules/sales/a.ts': 'import "../pricing/public";',
			'src/modules/pricing/public.ts': 'export const x = 1;',
		});
		try {
			await assertBoundaries(registry, 'src/modules/**/*.ts', { root });
		} finally {
			await rm(root, { recursive: true });
		}
	});

	test('throws listing each violation of a broken project', async () => {
		const root = await project({
			'src/modules/sales/a.ts': 'import "../pricing/prices";',
			'src/modules/pricing/b.ts': 'import "../sales/public";',
		});
		try {
			await expect(
				assertBoundaries(registry, 'src/modules/**/*.ts', { root }),
			).rejects.toThrow(/module boundaries broken:[\s\S]*pricing\/prices/);
		} finally {
			await rm(root, { recursive: true });
		}
	});
});
