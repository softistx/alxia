import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { DIST, filesOf, importsOf } from '../../test/boundary';

const ENTRY = join(DIST, 'entry/index.js');

describe('/entry', () => {
	test('imports react, react-dom/server, react-router and isbot alone', async () => {
		expect([...new Set(await importsOf(ENTRY))].sort()).toEqual([
			'isbot',
			'react',
			'react-dom/server',
			'react-router',
		]);
	});

	test('reaches no @alxia/core, node: module or bun', async () => {
		for (const specifier of await importsOf(ENTRY)) {
			expect(specifier).not.toStartWith('@alxia/');
			expect(specifier).not.toStartWith('node:');
			expect(specifier).not.toStartWith('bun');
		}
	});

	test('shares one DocumentNonce chunk with /document', async () => {
		const entry = await filesOf(ENTRY);
		const document = await filesOf(join(DIST, 'document/index.js'));
		expect(
			[...document].filter((file) => entry.has(file)).length,
		).toBeGreaterThan(0);
	});
});
