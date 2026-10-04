import { afterEach, describe, expect, test } from 'bun:test';
import { fakeRegistry } from '../test/scaffold';
import {
	allowedRange,
	bumpDependencies,
	type Manifest,
	newestWithin,
	registryUrl,
} from './registry';

const VERSIONS = {
	typescript: ['5.9.3', '6.0.3', '7.0.2', '7.1.0-dev.1', '8.0.0'],
	vite: ['7.3.0', '8.0.3', '8.3.2', '9.0.0'],
	'react-router': ['8.3.0', '8.4.0', '9.0.0'],
	'@react-router/node': ['8.3.0', '8.4.0', '8.4.1', '9.0.0'],
	'@react-router/dev': ['8.3.0', '8.4.0', '9.0.0'],
	'@types/node': ['22.20.5', '26.6.4'],
	zod: ['3.25.0', '4.2.0', '4.6.5'],
	isbot: ['5.1.36', '5.2.2'],
};

let stop: (() => void) | undefined;
afterEach(() => stop?.());

function registry(options: { failing?: readonly string[] } = {}) {
	const fake = fakeRegistry(VERSIONS, options);
	stop = fake.stop;
	return fake;
}

describe('allowedRange', () => {
	test("alxia's peer range, React Router's packages following react-router's", () => {
		expect(allowedRange('typescript')).toBe('^6.0.3 || ^7.0.0');
		expect(allowedRange('vite')).toBe('^7.0.0 || ^8.0.0');
		expect(allowedRange('zod')).toBe('^4.2.0');
		expect(allowedRange('react-router')).toBe('^8.0.0');
		expect(allowedRange('@react-router/dev')).toBe('^8.0.0');
		expect(allowedRange('isbot')).toBeUndefined();
	});
});

describe('newestWithin', () => {
	test('the newest release in the range, never a prerelease', () => {
		expect(newestWithin(VERSIONS.typescript, '^6.0.3 || ^7.0.0')).toBe('7.0.2');
		expect(newestWithin(VERSIONS.vite, '^7.0.0')).toBe('7.3.0');
		expect(newestWithin(VERSIONS.zod, '^5.0.0')).toBeUndefined();
	});
});

describe('registryUrl', () => {
	test("Bun's registry, then npm's, then npmjs.org, without a trailing slash", () => {
		expect(registryUrl({})).toBe('https://registry.npmjs.org');
		expect(registryUrl({ npm_config_registry: 'https://npm.example/' })).toBe(
			'https://npm.example',
		);
		expect(
			registryUrl({
				BUN_CONFIG_REGISTRY: 'https://bun.example',
				npm_config_registry: 'https://npm.example',
			}),
		).toBe('https://bun.example');
	});
});

describe('bumpDependencies', () => {
	test("moves each to the newest within alxia's range, and says which newer major it left out", async () => {
		const { url } = registry();
		const manifest: Manifest = {
			dependencies: { 'react-router': '^8.3.0', zod: '^4.2.0' },
			devDependencies: { typescript: '^5.9.3', vite: '^8.0.3' },
		};
		const bumped = await bumpDependencies(manifest, { url });
		expect(manifest).toEqual({
			dependencies: { 'react-router': '^8.4.0', zod: '^4.6.5' },
			devDependencies: { typescript: '^7.0.2', vite: '^8.3.2' },
		});
		expect(bumped.moved).toEqual([
			'react-router ^8.3.0 -> ^8.4.0',
			'zod ^4.2.0 -> ^4.6.5',
			'typescript ^5.9.3 -> ^7.0.2',
			'vite ^8.0.3 -> ^8.3.2',
		]);
		expect(bumped.held).toEqual([
			"react-router: kept to ^8.0.0, where the newest is 8.4.0; npm's latest, 9.0.0, is outside it",
			"typescript: kept to ^6.0.3 || ^7.0.0, where the newest is 7.0.2; npm's latest, 8.0.0, is outside it",
			"vite: kept to ^7.0.0 || ^8.0.0, where the newest is 8.3.2; npm's latest, 9.0.0, is outside it",
		]);
		expect(bumped.failed).toEqual([]);
	});

	test("takes npm's latest for a package no alxia peer holds", async () => {
		const { url } = registry();
		const manifest: Manifest = {
			dependencies: { isbot: '^5.1.36' },
			devDependencies: { '@types/node': '^22' },
		};
		const bumped = await bumpDependencies(manifest, { url });
		expect(manifest).toEqual({
			dependencies: { isbot: '^5.2.2' },
			devDependencies: { '@types/node': '^26.6.4' },
		});
		expect(bumped.held).toEqual([]);
	});

	test("React Router's packages take react-router's version, which @react-router/node pins", async () => {
		const { url } = registry();
		const manifest: Manifest = {
			dependencies: {
				'@react-router/node': '^8.3.0',
				'react-router': '^8.3.0',
			},
			devDependencies: { '@react-router/dev': '^8.3.0' },
		};
		await bumpDependencies(manifest, { url });
		// 8.4.1 is the newest @react-router/node; react-router is at 8.4.0.
		expect(manifest).toEqual({
			dependencies: {
				'@react-router/node': '^8.4.0',
				'react-router': '^8.4.0',
			},
			devDependencies: { '@react-router/dev': '^8.4.0' },
		});
	});

	test('leaves what `keep` names, and never asks the registry for it', async () => {
		const fake = registry();
		const manifest: Manifest = {
			dependencies: { '@alxia/core': '^0.3.0', zod: '^4.2.0' },
		};
		await bumpDependencies(
			manifest,
			{ url: fake.url },
			new Set(['@alxia/core']),
		);
		expect(manifest.dependencies).toEqual({
			'@alxia/core': '^0.3.0',
			zod: '^4.6.5',
		});
		expect(fake.requested).toEqual(['zod']);
	});

	test('a package the registry does not answer for keeps its version, and is named', async () => {
		const { url } = registry({ failing: ['vite'] });
		const manifest: Manifest = {
			devDependencies: { typescript: '^6.0.3', vite: '^8.0.3' },
		};
		const bumped = await bumpDependencies(manifest, { url });
		expect(manifest.devDependencies).toEqual({
			typescript: '^7.0.2',
			vite: '^8.0.3',
		});
		expect(bumped.failed).toEqual(['vite']);
	});

	test('a registry that does not answer in time: every version kept, every package named', async () => {
		const server = Bun.serve({
			port: 0,
			fetch: async () => {
				await Bun.sleep(500);
				return Response.json({});
			},
		});
		stop = () => server.stop(true);
		const manifest: Manifest = { dependencies: { zod: '^4.2.0' } };
		const bumped = await bumpDependencies(manifest, {
			url: `http://localhost:${server.port}`,
			timeout: 50,
		});
		expect(manifest.dependencies).toEqual({ zod: '^4.2.0' });
		expect(bumped).toEqual({
			moved: [],
			held: [],
			failed: ['zod'],
			unmatched: [],
		});
	});

	test('a package with no release in its range keeps its version, and says so', async () => {
		const fake = fakeRegistry({ zod: ['3.25.0', '5.0.0'] });
		stop = fake.stop;
		const manifest: Manifest = { dependencies: { zod: '^4.2.0' } };
		const bumped = await bumpDependencies(manifest, { url: fake.url });
		expect(manifest.dependencies).toEqual({ zod: '^4.2.0' });
		expect(bumped).toEqual({
			moved: [],
			held: [],
			failed: [],
			unmatched: ['zod: no release within ^4.2.0; kept ^4.2.0'],
		});
	});
});
