import { afterEach, describe, expect, test } from 'bun:test';
import { fakeRegistry } from '../test/registry';
import { bumpDependencies, KEPT_EXACT, type Manifest } from './registry';

let stop: (() => void) | undefined;
afterEach(() => stop?.());

describe('bumpDependencies, a pin kept as the template has it', () => {
	test('@nxgt/openapi-codegen keeps its exact version while Biome moves to its newest patch', async () => {
		const fake = fakeRegistry({
			'@nxgt/openapi-codegen': ['0.7.0', '0.7.1', '0.8.0'],
			'@biomejs/biome': ['2.5.15', '2.5.16', '2.6.0'],
		});
		stop = fake.stop;
		const manifest: Manifest = {
			devDependencies: {
				'@nxgt/openapi-codegen': '0.7.0',
				'@biomejs/biome': '2.5.15',
			},
		};
		const bumped = await bumpDependencies(manifest, { url: fake.url });
		expect(manifest.devDependencies).toEqual({
			'@nxgt/openapi-codegen': '0.7.0',
			'@biomejs/biome': '2.5.16',
		});
		expect(bumped.moved).toEqual(['@biomejs/biome 2.5.15 -> 2.5.16']);
		expect(KEPT_EXACT.has('@nxgt/openapi-codegen')).toBe(true);
	});

	test('a failing registry does not name a kept pin', async () => {
		const fake = fakeRegistry(
			{ '@nxgt/openapi-codegen': ['0.7.0', '0.7.1'] },
			{ failing: ['@nxgt/openapi-codegen'] },
		);
		stop = fake.stop;
		const manifest: Manifest = {
			devDependencies: { '@nxgt/openapi-codegen': '0.7.0' },
		};
		const bumped = await bumpDependencies(manifest, { url: fake.url });
		expect(bumped.failed).toEqual([]);
		expect(manifest.devDependencies?.['@nxgt/openapi-codegen']).toBe('0.7.0');
	});
});
