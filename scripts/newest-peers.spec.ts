import { describe, expect, test } from 'bun:test';
import {
	followPins,
	type Manifest,
	newest,
	readExamples,
	readManifests,
	rewrite,
} from './newest-peers';

test('the newest alternative of a range, none for a single one', () => {
	expect(newest('^6.0.3 || ^7.0.0')).toBe('^7.0.0');
	expect(newest('^16.11.0 || ^17.0.0')).toBe('^17.0.0');
	expect(newest('^4.6.5')).toBeUndefined();
});

const root: Manifest = {
	devDependencies: { typescript: '~6.0.3' },
	overrides: { typescript: '~6.0.3', graphql: '^16.11.0' },
};
const pkg = (name: string, manifest: Manifest = {}): Manifest => ({
	name,
	peerDependencies: { typescript: '^6.0.3 || ^7.0.0' },
	...manifest,
});

describe('rewrite', () => {
	test("the versions are the packages' pins, from rewrite", () => {
		const { versions } = rewrite(
			{ devDependencies: { typescript: '~6.0.3' } },
			new Map([
				[
					'packages/react-router/package.json',
					{
						name: '@alxia/react-router',
						peerDependencies: {
							vite: '^7.0.0 || ^8.0.0',
							typescript: '^6.0.3 || ^7.0.0',
						},
						devDependencies: { vite: '^7.0.0' },
					},
				],
			]),
		);
		expect(Object.fromEntries(versions)).toEqual({
			vite: '^8.0.0',
			typescript: '^7.0.0',
		});
	});

	test('a package’s own devDependency, the root’s, and every override', () => {
		const graphql = pkg('@alxia/graphql', {
			peerDependencies: {
				graphql: '^16.11.0 || ^17.0.0',
				typescript: '^6.0.3 || ^7.0.0',
			},
			devDependencies: { graphql: '^16.11.0' },
		});
		const result = rewrite(root, new Map([['g', graphql]]));
		expect(result.packages.get('g')?.devDependencies).toEqual({
			graphql: '^17.0.0',
		});
		expect(result.root.devDependencies).toEqual({ typescript: '^7.0.0' });
		expect(result.root.overrides).toEqual({
			typescript: '^7.0.0',
			graphql: '^17.0.0',
		});
		expect(graphql.devDependencies).toEqual({ graphql: '^16.11.0' });
	});

	test('a range nobody installs fails, rather than pass untested', () => {
		const lonely = pkg('@alxia/x', {
			peerDependencies: { zod: '^4.0.0 || ^5.0.0' },
		});
		expect(() => rewrite(root, new Map([['x', lonely]]))).toThrow(
			"add it to @alxia/x's devDependencies",
		);
	});

	test('packages disagreeing on the newest fails', () => {
		const other = pkg('@alxia/y', {
			peerDependencies: { typescript: '^6.0.3 || ^8.0.0' },
		});
		expect(() =>
			rewrite(
				root,
				new Map([
					['a', pkg('@alxia/a')],
					['y', other],
				]),
			),
		).toThrow('disagree on the newest typescript');
	});

	test('nothing with alternatives: nothing to test', () => {
		const single = { name: '@alxia/z', peerDependencies: { zod: '^4.6.5' } };
		expect(() => rewrite(root, new Map([['z', single]]))).toThrow(
			'nothing newer to test',
		);
	});
});

test('reads packages/* alone: an example widens no range and pins nothing', async () => {
	const { packages } = await readManifests();
	expect(packages.size).toBeGreaterThan(0);
	for (const path of packages.keys()) expect(path).toContain('/packages/');
	for (const manifest of packages.values()) {
		expect(manifest.name).toStartWith('@alxia/');
	}
});

describe('followPins', () => {
	const example: Manifest = {
		name: 'react-router-example',
		private: true,
		dependencies: { '@alxia/react-router': 'workspace:^', react: '^19.3.0' },
		devDependencies: { vite: '^7.0.0', typescript: '~6.0.3' },
	};

	test("moves an example's own copy of each pinned peer, and nothing else", () => {
		const versions = new Map([
			['vite', '^8.0.0'],
			['typescript', '^7.0.0'],
		]);
		const { examples, pinned } = followPins(
			new Map([['examples/react-router/package.json', example]]),
			(name) => versions.get(name),
		);
		expect(examples.get('examples/react-router/package.json')).toEqual({
			...example,
			devDependencies: { vite: '^8.0.0', typescript: '^7.0.0' },
		});
		expect(pinned).toHaveLength(2);
		// Pure: the manifest read stays as it was.
		expect(example.devDependencies?.['vite']).toBe('^7.0.0');
	});
});

test('readExamples reads examples/* alone', async () => {
	const examples = await readExamples();
	expect([...examples.values()].map((manifest) => manifest.name)).toContain(
		'react-router-example',
	);
	for (const path of examples.keys()) expect(path).toContain('/examples/');
});
