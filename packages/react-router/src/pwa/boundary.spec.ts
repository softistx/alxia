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

/** The relative chunks `entry` reaches, itself included. */
async function filesOf(entry: string, seen = new Set<string>()) {
	if (seen.has(entry)) return seen;
	seen.add(entry);
	const transpiler = new Bun.Transpiler({ loader: 'js' });
	for (const { path } of transpiler.scanImports(await Bun.file(entry).text())) {
		if (path.startsWith('.')) await filesOf(join(dirname(entry), path), seen);
	}
	return seen;
}

describe('/pwa', () => {
	test('imports nothing: no package, no node: module, no bun', async () => {
		expect(await importsOf(join(DIST, 'pwa/index.js'))).toEqual([]);
	});
});

describe('/pwa/react', () => {
	test('imports react alone: no core, no node: module, no bun', async () => {
		const imports = await importsOf(join(DIST, 'pwa/react/index.js'));
		expect([...new Set(imports)]).toEqual(['react']);
	});

	test('shares no chunk with the main entry, so a page never loads core for it', async () => {
		const react = await filesOf(join(DIST, 'pwa/react/index.js'));
		const main = await filesOf(join(DIST, 'index.js'));
		expect([...react].filter((file) => main.has(file))).toEqual([]);
	});
});
