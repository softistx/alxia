import { describe, expect, test } from 'bun:test';
import {
	accessProblems,
	manifestShapeProblems,
	workspaceProblems,
} from './manifest';

describe('manifestShapeProblems', () => {
	const httpyz = { name: '@alxia/core', version: '0.4.0' };
	const binding = (peerDependencies: Record<string, string>) => ({
		name: '@alxia/client',
		version: '0.3.0',
		peerDependencies,
	});

	test('accepts a caret range on a sibling that includes it', () => {
		expect(
			manifestShapeProblems([httpyz, binding({ '@alxia/core': '^0.4.0' })]),
		).toEqual([]);
	});

	test('refuses an exact pin on a sibling: two copies, two ValidationError classes', () => {
		expect(
			manifestShapeProblems([httpyz, binding({ '@alxia/core': '0.4.0' })]),
		).toEqual([expect.stringContaining('pins a sibling exactly')]);
	});

	test('refuses a sibling range that excludes the sibling published beside it', () => {
		expect(
			manifestShapeProblems([httpyz, binding({ '@alxia/core': '^0.3.0' })]),
		).toEqual([
			expect.stringContaining(
				'excludes @alxia/core@0.4.0, which is being published beside it',
			),
		]);
	});

	test('refuses a package that lists itself', () => {
		expect(
			manifestShapeProblems([
				{ ...httpyz, peerDependencies: { '@alxia/core': '.' } },
			]),
		).toEqual([expect.stringContaining('lists itself')]);
	});

	test('refuses link: and file: where a consumer installs, and not in devDependencies', () => {
		expect(
			manifestShapeProblems([
				{
					name: '@alxia/core',
					peerDependencies: { a: 'link:../a' },
					optionalDependencies: { b: 'file:../b' },
					devDependencies: { c: 'link:../c' },
				},
			]),
		).toEqual([
			'@alxia/core: peerDependencies.a = link:../a',
			'@alxia/core: optionalDependencies.b = file:../b',
		]);
	});

	test('refuses any dependency: alxia packages have peers only', () => {
		expect(
			manifestShapeProblems([
				{
					name: '@alxia/core',
					version: '1.0.0',
					dependencies: { zod: '^4.0.0' },
				},
			]),
		).toEqual([
			'@alxia/core: declares dependencies (zod); every alxia package has none — what it needs at runtime is a peer, chosen and installed by the app',
		]);
	});
});

describe('accessProblems', () => {
	test('accepts a scoped package published as public', () => {
		expect(
			accessProblems({
				name: '@alxia/core',
				publishConfig: { access: 'public' },
			}),
		).toEqual([]);
	});

	test('refuses a scoped package with no publishConfig', () => {
		expect(accessProblems({ name: '@alxia/core' })).toEqual([
			'@alxia/core: publishConfig.access is not "public"; bun publish would publish this scoped package as restricted',
		]);
	});
});

describe('workspaceProblems', () => {
	test('accepts a packed manifest whose ranges are versions', () => {
		expect(
			workspaceProblems({
				name: '@alxia/create',
				devDependencies: { '@alxia/core': '^0.3.0' },
			}),
		).toEqual([]);
	});

	test('refuses a workspace: range the pack left, devDependencies included', () => {
		expect(
			workspaceProblems({
				name: '@alxia/create',
				devDependencies: { '@alxia/core': 'workspace:^' },
			}),
		).toEqual([
			'@alxia/create: devDependencies.@alxia/core = workspace:^ in the packed manifest; bun pm pack should have written the version',
		]);
	});
});
