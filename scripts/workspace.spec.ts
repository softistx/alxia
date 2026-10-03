import { describe, expect, test } from 'bun:test';
import { foldersOf, readNodes, waves } from './workspace';

describe('waves', () => {
	test('a package runs after every sibling it names', () => {
		const order = waves([
			{ name: 'client', dir: '', needs: ['core', 'zod'] },
			{ name: 'core', dir: '', needs: [] },
			{ name: 'docs', dir: '', needs: ['client'] },
		]).map((wave) => wave.map((node) => node.name));
		expect(order).toEqual([['core'], ['client'], ['docs']]);
	});

	test('refuses a cycle', () => {
		expect(() =>
			waves([
				{ name: 'a', dir: '', needs: ['b'] },
				{ name: 'b', dir: '', needs: ['a'] },
			]),
		).toThrow('cycle');
	});
});

describe('foldersOf', () => {
	test('packages by default, the folders named in the order given', () => {
		expect(foldersOf([])).toEqual(['packages']);
		expect(foldersOf(['packages', 'examples'])).toEqual([
			'packages',
			'examples',
		]);
	});

	test('refuses a folder the workspace does not have', () => {
		expect(() => foldersOf(['example'])).toThrow(
			'Unknown folder example: expected packages or examples.',
		);
	});
});

describe('readNodes', () => {
	test('packages holds the packages alone, examples the examples', async () => {
		const packages = await readNodes('packages');
		expect(packages.length).toBeGreaterThan(0);
		for (const node of packages) expect(node.name).toStartWith('@alxia/');

		const examples = await readNodes('examples');
		expect(examples.map((node) => node.name)).toContain('react-router-example');
		for (const node of examples) expect(node.dir).toContain('/examples/');
	});

	test('an example needs the packages it uses: they run in the folder before', async () => {
		const [example] = (await readNodes('examples')).filter(
			(node) => node.name === 'react-router-example',
		);
		expect(example?.needs).toContain('@alxia/react-router');
		// Not in its own folder's names: its first wave, once packages ran.
		expect(waves(example === undefined ? [] : [example])).toHaveLength(1);
	});
});
