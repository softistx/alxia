import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { alxia } from '@alxia/core';
import { AN_HOUR, serveClient } from './assets';

const dirs: string[] = [];
function client(files: Record<string, string>): string {
	const dir = mkdtempSync(join(tmpdir(), 'alxia-rr-client-'));
	dirs.push(dir);
	mkdirSync(join(dir, 'assets'));
	for (const [name, body] of Object.entries(files)) {
		writeFileSync(join(dir, name), body);
	}
	return dir;
}
afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe('serveClient', () => {
	test('a public file whose name a URL encodes is served at its encoded path', async () => {
		const app = alxia();
		serveClient(app, client({ 'my file.txt': 'spaced', 'café.txt': 'accent' }));
		const spaced = await app.request('/my%20file.txt');
		expect(spaced.status).toBe(200);
		expect(await spaced.text()).toBe('spaced');
		expect(spaced.headers.get('cache-control')).toBe(AN_HOUR);
		const accent = await app.request('/caf%C3%A9.txt');
		expect(await accent.text()).toBe('accent');
	});

	test('a name no route can carry is refused, naming the file', () => {
		const dir = client({ 'a:b.txt': 'colon' });
		expect(() => serveClient(alxia(), dir)).toThrow(
			`reactRouter(): ${join(dir, 'a:b.txt')} cannot be served at a path of its own name; rename it.`,
		);
	});
});
