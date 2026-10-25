import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { DIST, filesOf, importsOf } from '../../test/boundary';

describe('/document', () => {
	test('imports react alone: no core, no react-router, no node: module, no bun', async () => {
		const imports = await importsOf(join(DIST, 'document/index.js'));
		expect([...new Set(imports)]).toEqual(['react']);
	});

	test('makes no jsx-runtime import: it is written with createElement', async () => {
		const imports = await importsOf(join(DIST, 'document/index.js'));
		expect(imports).not.toContain('react/jsx-runtime');
	});

	test('shares no chunk with the main entry, so a page never loads core for it', async () => {
		const document = await filesOf(join(DIST, 'document/index.js'));
		const main = await filesOf(join(DIST, 'index.js'));
		expect([...document].filter((file) => main.has(file))).toEqual([]);
	});
});
