import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { DIST, filesOf, importsOf } from '../../test/boundary';

describe('/subscription', () => {
	test('imports nothing: web APIs only, so it adds no peer', async () => {
		const imports = await importsOf(join(DIST, 'subscription/index.js'));
		expect(imports).toEqual([]);
	});

	test('shares no chunk with the main entry', async () => {
		const own = await filesOf(join(DIST, 'subscription/index.js'));
		const main = await filesOf(join(DIST, 'index.js'));
		expect([...own].filter((file) => main.has(file))).toEqual([]);
	});
});
