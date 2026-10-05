import { describe, expect, test } from 'bun:test';
import { behind, report, tracked } from './check-nxgt-versions';
import type { Manifest } from './newest-peers';
import { lock, manifests } from './test/check-nxgt-versions-helpers';

describe('behind', () => {
	const packages = tracked(manifests, lock);
	const at = (redis: string, i18n = '2.0.0') =>
		new Map([
			['@nxgt/i18n', i18n],
			['@nxgt/redis', redis],
		]);

	test('answers nothing when every lock is at latest', () => {
		expect(behind(packages, at('0.3.1'))).toEqual([]);
	});

	test('answers a package whose lock is below latest, by semver and not by text', () => {
		expect(behind(packages, at('0.3.10'))).toEqual([
			{
				name: '@nxgt/redis',
				dirs: ['packages/core', 'packages/redis'],
				peers: ['^0.3.1'],
				locked: '0.3.1',
				latest: '0.3.10',
				admitted: true,
			},
		]);
	});

	test('says when the peer range does not admit latest, as a 0.x minor', () => {
		expect(behind(packages, at('0.4.0')).map((one) => one.admitted)).toEqual([
			false,
		]);
	});

	test('admits latest only when every peer range declaring it does', () => {
		const two = new Map<string, Manifest>([
			[
				'packages/a',
				{
					name: '@alxia/a',
					peerDependencies: { '@nxgt/redis': '^0.3.1 || ^0.4.0' },
					devDependencies: { '@nxgt/redis': '^0.3.1' },
				},
			],
			[
				'packages/b',
				{
					name: '@alxia/b',
					peerDependencies: { '@nxgt/redis': '^0.3.1' },
					devDependencies: { '@nxgt/redis': '^0.3.1' },
				},
			],
		]);
		const found = behind(
			tracked(two, lock),
			new Map([['@nxgt/redis', '0.4.0']]),
		);
		expect(found.map((one) => [one.peers, one.admitted])).toEqual([
			[['^0.3.1', '^0.3.1 || ^0.4.0'], false],
		]);
		expect(report(found)).toEqual([
			'@nxgt/redis: 0.3.1 → 0.4.0 (packages/a, packages/b, peer ^0.3.1 and ^0.3.1 || ^0.4.0 must widen)',
		]);
	});

	test('does not report a lock ahead of latest, as after a dist-tag moved back', () => {
		expect(behind(packages, at('0.3.0'))).toEqual([]);
	});

	test('answers a package the lock does not hold', () => {
		expect(
			behind(tracked(manifests, {}), at('0.3.1')).map((one) => one.locked),
		).toEqual([null, null]);
	});

	test('throws when latest is unknown, rather than calling it current', () => {
		expect(() => behind(packages, new Map([['@nxgt/redis', '0.3.1']]))).toThrow(
			'no latest version for @nxgt/i18n',
		);
	});
});
