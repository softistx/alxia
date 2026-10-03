import { beforeAll, describe, expect, test } from 'bun:test';
// By its published name, as the fixture's entry.server imports it: one
// `alxiaContext` for the catch-all and the entry.
import { alxiaContext, nonceOf, reactRouter } from '@alxia/react-router';
import { RouterContextProvider, type ServerBuild } from 'react-router';
import { makeBase } from '../fixture/base';
import { BROWSER, fixtureBuild } from '../test/fixture';

let build: ServerBuild;
beforeAll(async () => {
	build = await fixtureBuild();
}, 60_000);

const browser = { 'user-agent': BROWSER };

/** Every `<script …>` opening tag of a page. */
const scriptsOf = (html: string) => html.match(/<script\b[^>]*>/g) ?? [];

/** The whole of a streamed page, the deferred chunks included. */
async function page(app: ReturnType<typeof makeBase>, path: string) {
	const response = await app.request(path, { headers: browser });
	expect(response.status).toBe(200);
	return response.text();
}

describe('nonceOf in entry.server', () => {
	test("every script of the page carries the context's nonce, the streamed ones too", async () => {
		// A derive of the app's own: no @alxia/secure-headers needed.
		const app = makeBase()
			.derive(() => ({ nonce: 'bm9uY2Utb2YtYS1zcGVj' }))
			.use((app) => reactRouter(app, { build }));
		for (const path of ['/', '/slow']) {
			const scripts = scriptsOf(await page(app, path));
			expect(scripts.length).toBeGreaterThan(1);
			for (const script of scripts) {
				expect(script).toContain('nonce="bm9uY2Utb2YtYS1zcGVj"');
			}
		}
		expect(await page(app, '/slow')).toContain('deferred-value');
	});

	test('without a nonce on the context, no script carries one', async () => {
		const app = makeBase().use((app) => reactRouter(app, { build }));
		const html = await page(app, '/slow');
		expect(scriptsOf(html).length).toBeGreaterThan(1);
		expect(html).not.toContain('nonce=');
	});

	test('reads a string nonce if present, and nothing else', () => {
		const provider = (ctx?: unknown) => {
			const context = new RouterContextProvider();
			if (ctx !== undefined) context.set(alxiaContext, ctx);
			return context;
		};
		expect(nonceOf(provider({ nonce: 'abc' }))).toBe('abc');
		expect(nonceOf(provider())).toBeUndefined();
		expect(nonceOf(provider({ user: 'Ada' }))).toBeUndefined();
		expect(nonceOf(provider({ nonce: 42 }))).toBeUndefined();
		expect(nonceOf(provider(null))).toBeUndefined();
	});
});
