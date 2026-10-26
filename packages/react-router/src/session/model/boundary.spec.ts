import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { DIST, importsOf } from '../../../test/boundary';

describe('/session/model', () => {
	test('imports nothing: no package, no node: module, no bun', async () => {
		expect(await importsOf(join(DIST, 'session/model/index.js'))).toEqual([]);
	});

	test('declares no import of a package, not even as a type', async () => {
		const dts = await Bun.file(join(DIST, 'session/model/index.d.ts')).text();
		expect(dts).not.toMatch(/from ['"][^.]/);
	});
});
