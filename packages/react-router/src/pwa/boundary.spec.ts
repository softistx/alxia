import { describe, expect, test } from 'bun:test';
import { dirname, join, resolve } from 'node:path';

const DIST = resolve(import.meta.dir, '../../dist');

/** Every specifier `entry` imports, and those of the relative chunks it reaches. */
async function importsOf(entry: string, seen = new Set<string>()) {
	const specifiers: string[] = [];
	if (seen.has(entry)) return specifiers;
	seen.add(entry);
	const transpiler = new Bun.Transpiler({ loader: 'js' });
	const source = await Bun.file(entry).text();
	for (const { path } of transpiler.scanImports(source)) {
		if (path.startsWith('.')) {
			specifiers.push(...(await importsOf(join(dirname(entry), path), seen)));
		} else {
			specifiers.push(path);
		}
	}
	return specifiers;
}

describe('/pwa', () => {
	test('imports nothing: no package, no node: module, no bun', async () => {
		expect(await importsOf(join(DIST, 'pwa/index.js'))).toEqual([]);
	});
});
