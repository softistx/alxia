import { describe, expect, test } from 'bun:test';
import { majorOf, rewrite, widenedPeers } from './newest-majors';
import type { Manifest } from './newest-peers';

test('the major of a version or a range', () => {
	expect(majorOf('7.0.2')).toBe(7);
	expect(majorOf('~6.0.3')).toBe(6);
	expect(majorOf('^17.0.0')).toBe(17);
});

const root: Manifest = {
	devDependencies: { typescript: '~6.0.3' },
	overrides: { typescript: '~6.0.3' },
};
const graphql: Manifest = {
	name: '@alxia/graphql',
	peerDependencies: {
		graphql: '^16.11.0 || ^17.0.0',
		'graphql-yoga': '^5.16.0',
		typescript: '^6.0.3 || ^7.0.0',
	},
	devDependencies: { graphql: '^16.11.0', 'graphql-yoga': '^5.16.0' },
};
const latest = new Map([
	['typescript', '7.0.2'],
	['graphql', '17.0.2'],
]);

test('the widened peers, by the newest major a range names', () => {
	expect(widenedPeers(new Map([['g', graphql]]))).toEqual(
		new Map([
			['graphql', 17],
			['typescript', 7],
		]),
	);
});

describe('rewrite', () => {
	test('npm’s latest behind each manifest’s own operator', () => {
		const result = rewrite(root, new Map([['g', graphql]]), latest);
		expect(result.root.devDependencies).toEqual({ typescript: '~7.0.2' });
		expect(result.root.overrides).toEqual({ typescript: '~7.0.2' });
		expect(result.packages.get('g')?.devDependencies).toEqual({
			graphql: '^17.0.2',
			'graphql-yoga': '^5.16.0',
		});
		expect(result.ahead).toEqual([]);
		expect(graphql.devDependencies?.graphql).toBe('^16.11.0');
	});

	test('a major no range accepts yet is pinned, and said', () => {
		const result = rewrite(
			root,
			new Map([['g', graphql]]),
			new Map([...latest, ['typescript', '8.0.0']]),
		);
		expect(result.root.devDependencies).toEqual({ typescript: '~8.0.0' });
		expect(result.ahead).toEqual([
			'typescript 8.0.0 is newer than any peer range accepts (^7): widen them once this job is green.',
		]);
	});

	test('a widened peer nobody installs fails, rather than pass untested', () => {
		const lonely: Manifest = {
			name: '@alxia/x',
			peerDependencies: { zod: '^4.0.0 || ^5.0.0' },
		};
		expect(() =>
			rewrite(root, new Map([['x', lonely]]), new Map([['zod', '5.0.0']])),
		).toThrow('neither it nor the root installs zod');
	});

	test('a peer npm gave no version of fails', () => {
		expect(() =>
			rewrite(
				root,
				new Map([['g', graphql]]),
				new Map([['graphql', '17.0.2']]),
			),
		).toThrow('npm gave no latest version of typescript');
	});

	test('nothing with alternatives: nothing to test', () => {
		const single: Manifest = {
			name: '@alxia/z',
			peerDependencies: { zod: '^4.6.5' },
		};
		expect(() => rewrite(root, new Map([['z', single]]), latest)).toThrow(
			'nothing newer to test',
		);
	});
});
