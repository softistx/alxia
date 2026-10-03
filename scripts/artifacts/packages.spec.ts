import { describe, expect, test } from 'bun:test';
import { readPackages, subpathsOf } from './packages';

describe('subpathsOf', () => {
	test('names every exported subpath, and not package.json', () => {
		expect(
			subpathsOf('@alxia/core', {
				'.': {},
				'./integration': {},
				'./package.json': './package.json',
			}),
		).toEqual(['@alxia/core', '@alxia/core/integration']);
	});
});

describe('readPackages', () => {
	test('verify:artifacts packs packages/* alone, never an example', async () => {
		const pkgs = await readPackages();
		expect(pkgs.length).toBeGreaterThan(0);
		for (const pkg of pkgs) {
			expect(pkg.name).toStartWith('@alxia/');
			expect(pkg.dir).toContain('/packages/');
		}
	});
});
