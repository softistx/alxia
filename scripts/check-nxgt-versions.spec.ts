import { describe, expect, test } from 'bun:test';
import {
	behind,
	check,
	read,
	report,
	type Tracked,
	tracked,
} from './check-nxgt-versions';
import type { Manifest } from './newest-peers';

const manifests = new Map<string, Manifest>([
	[
		'packages/redis',
		{
			name: '@alxia/redis',
			peerDependencies: {
				'@alxia/core': 'workspace:^',
				'@nxgt/redis': '^0.3.1',
				'@nxgt/redis-guard': '^0.3.1',
			},
			devDependencies: {
				'@alxia/core': 'workspace:^',
				'@nxgt/redis': '^0.3.1',
				'@nxgt/redis-guard': '^0.3.1',
				zod: '^4.6.5',
			},
		},
	],
	[
		'packages/i18n',
		{
			name: '@alxia/i18n',
			peerDependencies: { '@nxgt/i18n': '^2.0.0' },
			devDependencies: { '@nxgt/i18n': '^2.0.0', '@nxgt/local': 'workspace:^' },
		},
	],
	[
		'packages/core',
		{ name: '@alxia/core', devDependencies: { '@nxgt/redis': '^0.3.1' } },
	],
]);

const lock = {
	'@alxia/core': ['@alxia/core@workspace:packages/core'],
	'@nxgt/i18n': ['@nxgt/i18n@2.0.0', '', {}, 'sha512-a'],
	'@nxgt/redis': ['@nxgt/redis@0.3.1', '', {}, 'sha512-b'],
	'@nxgt/redis-guard': ['@nxgt/redis-guard@0.3.1', '', {}, 'sha512-c'],
	zod: ['zod@4.6.5', '', {}, 'sha512-d'],
};

describe('tracked', () => {
	test('lists the @nxgt/* devDependencies, with who names them, their peer ranges and what is locked', () => {
		expect(tracked(manifests, lock)).toEqual([
			{
				name: '@nxgt/i18n',
				dirs: ['packages/i18n'],
				peers: ['^2.0.0'],
				locked: ['2.0.0'],
			},
			{
				name: '@nxgt/redis',
				dirs: ['packages/core', 'packages/redis'],
				peers: ['^0.3.1'],
				locked: ['0.3.1'],
			},
			{
				name: '@nxgt/redis-guard',
				dirs: ['packages/redis'],
				peers: ['^0.3.1'],
				locked: ['0.3.1'],
			},
		]);
	});

	test('skips a workspace: devDependency and anything outside @nxgt/', () => {
		const names = tracked(manifests, lock).map((one) => one.name);
		expect(names).not.toContain('@nxgt/local');
		expect(names).not.toContain('@alxia/core');
		expect(names).not.toContain('zod');
	});

	test('holds every version the lock resolves, oldest first, and no other kind of source', () => {
		const [i18n] = tracked(manifests, {
			'@nxgt/i18n': ['@nxgt/i18n@2.0.0'],
			'@alxia/i18n/@nxgt/i18n': ['@nxgt/i18n@1.10.0'],
			'@alxia/x/@nxgt/i18n': ['@nxgt/i18n@github:softistx/nxgt-core'],
		});
		expect(i18n?.locked).toEqual(['1.10.0', '2.0.0']);
	});

	test('reads an empty lock as nothing locked', () => {
		expect(tracked(manifests, {}).map((one) => one.locked)).toEqual([
			[],
			[],
			[],
		]);
	});
});

describe('behind', () => {
	const packages = tracked(manifests, lock);
	const at = (redis: string, guard = '0.3.1', i18n = '2.0.0') =>
		new Map([
			['@nxgt/i18n', i18n],
			['@nxgt/redis', redis],
			['@nxgt/redis-guard', guard],
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
		expect(
			behind(packages, at('0.3.1', '0.4.0')).map((one) => one.admitted),
		).toEqual([false]);
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
		).toEqual([null, null, null]);
	});

	test('throws when latest is unknown, rather than calling it current', () => {
		expect(() => behind(packages, new Map([['@nxgt/redis', '0.3.1']]))).toThrow(
			'no latest version for @nxgt/i18n',
		);
	});
});

describe('report', () => {
	test('names the package, both versions, where it is declared and its peer range', () => {
		expect(
			report([
				{
					name: '@nxgt/redis',
					dirs: ['packages/redis'],
					peers: ['^0.3.1'],
					locked: '0.3.1',
					latest: '0.4.0',
					admitted: false,
				},
				{
					name: '@nxgt/i18n',
					dirs: ['packages/i18n'],
					peers: ['^2.0.0'],
					locked: null,
					latest: '2.1.0',
					admitted: true,
				},
				{
					name: '@nxgt/x',
					dirs: ['packages/x'],
					peers: [],
					locked: '1.0.0',
					latest: '1.1.0',
					admitted: true,
				},
			]),
		).toEqual([
			'@nxgt/redis: 0.3.1 → 0.4.0 (packages/redis, peer ^0.3.1 must widen)',
			'@nxgt/i18n: not in bun.lock → 2.1.0 (packages/i18n, peer ^2.0.0 admits it)',
			'@nxgt/x: 1.0.0 → 1.1.0 (packages/x)',
		]);
	});
});

describe('check', () => {
	const input = async () => ({ manifests, lockPackages: lock });
	const latest = (versions: Record<string, string>) => async (name: string) =>
		versions[name] ?? Promise.reject(new Error(`no answer for ${name}`));

	test('exits 0 when everything is current', async () => {
		expect(
			await check(
				input,
				latest({
					'@nxgt/i18n': '2.0.0',
					'@nxgt/redis': '0.3.1',
					'@nxgt/redis-guard': '0.3.1',
				}),
			),
		).toEqual({
			code: 0,
			lines: ['3 @nxgt/* devDependencies, all current'],
		});
	});

	test('exits 1 with one line per package behind', async () => {
		expect(
			await check(
				input,
				latest({
					'@nxgt/i18n': '2.1.0',
					'@nxgt/redis': '0.3.1',
					'@nxgt/redis-guard': '0.3.1',
				}),
			),
		).toEqual({
			code: 1,
			lines: [
				'- @nxgt/i18n: 2.0.0 → 2.1.0 (packages/i18n, peer ^2.0.0 admits it)',
			],
		});
	});

	test('exits 2 when the registry cannot say, rather than calling it current', async () => {
		expect(
			await check(input, async (name) => {
				throw new Error(`npm has no latest ${name}: 503 Service Unavailable`);
			}),
		).toEqual({
			code: 2,
			lines: ['npm has no latest @nxgt/i18n: 503 Service Unavailable'],
		});
	});

	test('exits 2 when the repository cannot be read', async () => {
		expect(
			await check(
				async () => {
					throw new Error('ENOENT: bun.lock');
				},
				async () => '0.0.0',
			),
		).toEqual({ code: 2, lines: ['ENOENT: bun.lock'] });
	});
});

describe('read', () => {
	test("reads this repository's adapters and bun.lock, trailing commas included", async () => {
		const { manifests: found, lockPackages } = await read();
		const packages: Tracked[] = tracked(found, lockPackages);
		expect(packages.map(({ name, dirs }) => [name, dirs])).toEqual([
			['@nxgt/i18n', ['packages/i18n']],
			['@nxgt/janus', ['packages/janus']],
			['@nxgt/redis', ['packages/redis']],
			['@nxgt/redis-guard', ['packages/redis']],
			['@nxgt/telemetry', ['packages/telemetry']],
		]);
		for (const one of packages) {
			expect(one.locked.length).toBeGreaterThan(0);
			expect(one.peers.length).toBe(1);
		}
	});
});
