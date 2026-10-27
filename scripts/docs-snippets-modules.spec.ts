import { describe, expect, test } from 'bun:test';
import { type Install, linksOf } from './docs-snippets/project';

const graphql = (owner: string, version: string, peer: boolean): Install => ({
	name: 'graphql',
	owner,
	path: `packages/${owner}/node_modules/graphql`,
	real: `node_modules/.bun/graphql@${version}/node_modules/graphql`,
	peer,
});

describe('linksOf', () => {
	test('a name installed at two copies links the one of the package that takes it as a peer, whatever the order', () => {
		// `@alxia/graphql` resolves `graphql` from its own node_modules: a doc that
		// imported another copy would build its errors with a second `GraphQLError`
		// class, which Yoga masks as INTERNAL_SERVER_ERROR.
		const installs = [
			graphql('react-router', '17.0.2', false),
			graphql('graphql', '16.14.2', true),
			graphql('create', '16.14.2', false),
		];
		for (const order of [installs, [...installs].reverse()]) {
			expect(linksOf(order).get('graphql')).toBe(
				'packages/graphql/node_modules/graphql',
			);
		}
	});

	test('two peers on different copies are refused: no one app holds both', () => {
		expect(() =>
			linksOf([
				graphql('graphql', '16.14.2', true),
				graphql('i18n', '17.0.2', true),
			]),
		).toThrow(/graphql.*graphql, i18n/);
	});

	test('with no peer among them, the first package in name order wins', () => {
		const installs = [
			graphql('react-router', '17.0.2', false),
			graphql('create', '16.14.2', false),
		];
		expect(linksOf(installs).get('graphql')).toBe(
			'packages/create/node_modules/graphql',
		);
		expect(linksOf([...installs].reverse()).get('graphql')).toBe(
			'packages/create/node_modules/graphql',
		);
	});

	test('one copy shared by several packages links once, the peer one', () => {
		const links = linksOf([
			graphql('graphql', '16.14.2', true),
			graphql('create', '16.14.2', false),
		]);
		expect([...links]).toEqual([
			['graphql', 'packages/graphql/node_modules/graphql'],
		]);
	});
});
