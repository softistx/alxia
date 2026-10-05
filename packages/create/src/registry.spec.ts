import { describe, expect, test } from 'bun:test';
import { VERSIONS } from '../test/registry';
import {
	allowedRange,
	isExact,
	newestOfMinor,
	newestWithin,
	registryUrl,
	sameMinor,
} from './registry';

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

describe('isExact', () => {
	test('one version, with no operator, is exact', () => {
		expect(isExact('2.5.15')).toBe(true);
		for (const range of [
			'^2.5.15',
			'~2.5.15',
			'2.x',
			'>=2.5.15',
			'^22',
			'latest',
		])
			expect(isExact(range)).toBe(false);
	});
});

describe('newestWithin', () => {
	test('the newest release in the range, never a prerelease', () => {
		expect(newestWithin(VERSIONS.typescript, '^6.0.3 || ^7.0.0')).toBe('7.0.2');
		expect(newestWithin(VERSIONS.vite, '^7.0.0')).toBe('7.3.0');
		expect(newestWithin(VERSIONS.zod, '^5.0.0')).toBeUndefined();
	});
});

describe('sameMinor', () => {
	test("the minor of a range's first version, or undefined", () => {
		expect(sameMinor('^0.3.1')).toBe('~0.3.0');
		expect(sameMinor('^1.4.2')).toBe('~1.4.0');
		expect(sameMinor('*')).toBeUndefined();
	});
});

describe('newestOfMinor', () => {
	test("the newest of the range's minor, only when its ^ takes the range's start", () => {
		expect(newestOfMinor(['0.2.9', '0.3.0'], '^0.3.1')).toBe('0.3.0');
		expect(newestOfMinor(['1.3.0', '1.4.0', '1.4.1'], '^1.4.2')).toBe('1.4.1');
		expect(newestOfMinor(['0.2.9'], '^0.3.0')).toBeUndefined();
		// ^0.0.2 does not take 0.0.3.
		expect(newestOfMinor(['0.0.2'], '^0.0.3')).toBeUndefined();
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
