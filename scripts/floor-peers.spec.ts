import { describe, expect, test } from 'bun:test';
import { floorOf, refuseRootPins, rewrite, yogaFirstMajor } from './floor-peers';
import type { Manifest } from './newest-peers';

const versions = ['0.6.9', '0.7.0-beta.1', '0.7.0', '0.7.1', '0.8.0', '0.9.2'];

describe('floorOf', () => {
	test('the lowest stable version of an alternatives list', () => {
		expect(floorOf('^0.7.0 || ^0.8.0 || ^0.9.0', versions)).toBe('0.7.0');
	});
	test('the lowest stable version of a >= < range', () => {
		expect(floorOf('>=0.7.1 <0.9.0', versions)).toBe('0.7.1');
	});
	test('a prerelease and versions below the range are never the floor', () => {
		expect(floorOf('>=0.7.0-beta.1', versions)).toBe('0.7.0');
		expect(floorOf('^0.8.0', versions)).toBe('0.8.0');
	});
	test('throws when nothing is admitted', () => {
		expect(() => floorOf('^1.0.0', versions)).toThrow(/No published version/);
	});
});

const manifest = (name: string, extra: Manifest): [string, Manifest] => [
	`packages/${name}/package.json`,
	{ name: `@alxia/${name}`, ...extra },
];
const published = (name: string) =>
	name === '@nxgt/i18n' ? ['3.0.0', '3.1.0'] : versions;

describe('rewrite', () => {
	test('pins the floor, exact, in every package that installs the peer', () => {
		const { packages, floors } = rewrite(
			new Map([
				manifest('redis', {
					peerDependencies: {
						'@nxgt/redis': '^0.7.0 || ^0.8.0',
						typescript: '^6',
					},
					devDependencies: { '@nxgt/redis': '^0.9.2', typescript: '~6.0.3' },
				}),
				manifest('i18n', {
					peerDependencies: { '@nxgt/i18n': '^3.0.0' },
					devDependencies: { '@nxgt/i18n': '^3.1.0' },
				}),
				manifest('janus', {
					devDependencies: {
						'@nxgt/i18n': '^3.1.0',
						'@alxia/core': 'workspace:^',
					},
				}),
			]),
			published,
		);
		expect(floors.get('@nxgt/redis')).toBe('0.7.0');
		const dev = (name: string) =>
			packages.get(`packages/${name}/package.json`)?.devDependencies;
		expect(dev('redis')).toEqual({
			'@nxgt/redis': '0.7.0',
			typescript: '~6.0.3',
		});
		expect(dev('i18n')?.['@nxgt/i18n']).toBe('3.0.0');
		expect(dev('janus')).toEqual({
			'@nxgt/i18n': '3.0.0',
			'@alxia/core': 'workspace:^',
		});
	});
	test('throws when two packages disagree on a floor', () => {
		const pkg = (name: string, range: string) =>
			manifest(name, {
				peerDependencies: { '@nxgt/redis': range },
				devDependencies: { '@nxgt/redis': '^0.9.2' },
			});
		expect(() =>
			rewrite(new Map([pkg('a', '^0.7.0'), pkg('b', '^0.8.0')]), published),
		).toThrow(/disagree/);
	});
	test('throws when no package installs a peer', () => {
		expect(() =>
			rewrite(
				new Map([
					manifest('a', { peerDependencies: { '@nxgt/redis': '^0.7.0' } }),
				]),
				published,
			),
		).toThrow(/No package installs/);
	});
	test('throws when a package lists the peer in dependencies', () => {
		expect(() =>
			rewrite(
				new Map([
					manifest('a', {
						peerDependencies: { '@nxgt/redis': '^0.7.0' },
						dependencies: { '@nxgt/redis': '^0.7.0' },
					}),
				]),
				published,
			),
		).toThrow(/in dependencies/);
	});
	test('throws when there is nothing to pin', () => {
		expect(() =>
			rewrite(
				new Map([manifest('a', { peerDependencies: { typescript: '^6' } })]),
				published,
			),
		).toThrow(/nothing to pin/);
	});
});

describe('refuseRootPins', () => {
	test('throws when the root overrides a pinned peer', () => {
		expect(() =>
			refuseRootPins({ overrides: { '@nxgt/redis': '0.9.2' } }, [
				'@nxgt/redis',
			]),
		).toThrow(/root package.json names @nxgt\/redis in overrides/);
	});
	test('accepts a root that names none of them', () => {
		expect(() =>
			refuseRootPins({ devDependencies: { typescript: '^6' } }, [
				'@nxgt/redis',
			]),
		).not.toThrow();
	});
});

describe('yogaFirstMajor', () => {
	const yoga = (name: string) =>
		name === 'graphql-yoga'
			? ['5.15.0', '5.16.0', '5.22.0', '6.0.1']
			: ['3.24.2', '3.25.0', '4.0.1'];
	test('pins Yoga 5 at its floor and the plugins at their newest 3.x', () => {
		const packages = new Map([
			manifest('graphql', {
				peerDependencies: { 'graphql-yoga': '^5.16.0 || ^6.0.0' },
				devDependencies: {
					'graphql-yoga': '^6.0.1',
					'@graphql-yoga/plugin-csrf-prevention': '^4.0.1',
				},
			}),
			manifest('core', { devDependencies: { zod: '^4' } }),
		]);
		const pins = yogaFirstMajor(packages, yoga);
		const dev = packages.get('packages/graphql/package.json')?.devDependencies;
		expect(dev?.['graphql-yoga']).toBe('5.16.0');
		expect(dev?.['@graphql-yoga/plugin-csrf-prevention']).toBe('3.25.0');
		expect(pins.size).toBe(2);
	});
});
