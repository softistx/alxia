import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { DIST, importsOf } from '../../test/boundary';

describe('/subscription', () => {
	test("imports react-router alone (through /errors' same-site check), so it adds no peer", async () => {
		const imports = await importsOf(join(DIST, 'subscription/index.js'));
		expect([...new Set(imports)]).toEqual(['react-router']);
	});
});
