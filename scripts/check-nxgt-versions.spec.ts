import { describe, expect, test } from 'bun:test';
import { read, report, type Tracked, tracked } from './check-nxgt-versions';
import { lock, manifests } from './test/check-nxgt-versions-helpers';

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
		expect(tracked(manifests, {}).map((one) => one.locked)).toEqual([[], []]);
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

describe('read', () => {
	test("reads this repository's adapters and bun.lock, trailing commas included", async () => {
		const { manifests: found, lockPackages } = await read();
		const packages: Tracked[] = tracked(found, lockPackages);
		expect(packages.map(({ name, dirs }) => [name, dirs])).toEqual([
			['@nxgt/di', ['packages/di']],
			['@nxgt/httpyz', ['packages/create']],
			['@nxgt/i18n', ['packages/i18n', 'packages/janus']],
			['@nxgt/janus', ['packages/janus']],
			['@nxgt/openapi-codegen', ['packages/create']],
			['@nxgt/openapi-httpyz', ['packages/create']],
			['@nxgt/redis', ['packages/redis']],
			// @alxia/graphql's is a devDependency, for its observed-socket spec.
			['@nxgt/telemetry', ['packages/graphql', 'packages/telemetry']],
		]);
		for (const one of packages) {
			expect(one.locked.length).toBeGreaterThan(0);
			// The api template's generator and test client are @alxia/create's
			// tools, no peer.
			expect(one.peers.length).toBe(
				one.dirs.includes('packages/create') ? 0 : 1,
			);
		}
	});

	test('reads packages/* alone: an example is no release to keep current', async () => {
		const { manifests: found } = await read();
		expect(found.size).toBeGreaterThan(0);
		for (const dir of found.keys()) expect(dir).toStartWith('packages/');
	});
});
