import { describe, expect, test } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { browser, CLIENT, text } from '../test/fixture';
import { loadBuild, served } from '../test/react-router-helpers';

loadBuild();

describe('/pwa/react in a page', () => {
	test('a page using the hooks and the model is server rendered', async () => {
		const response = await served().request('/online', { headers: browser });
		expect(response.status).toBe(200);
		const html = text(await response.text());
		expect(html).toContain('<p id="online">online</p>');
		expect(html).toContain(
			'<p id="manifest">/manifest.webmanifest?lang=en</p>',
		);
	});

	test('the client build carries no node: import and none of core (by a message only core carries)', async () => {
		const assets = join(CLIENT, 'assets');
		const scripts = (await readdir(assets)).filter((name) =>
			name.endsWith('.js'),
		);
		expect(scripts.length).toBeGreaterThan(0);
		for (const name of scripts) {
			const source = await Bun.file(join(assets, name)).text();
			expect(source).not.toMatch(/(?:from|import)\s*\(?\s*["']node:/);
			expect(source).not.toContain(': no middleware is given');
		}
	});
});
