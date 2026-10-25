/**
 * The dev error page of `@alxia/core` behind `secureHeaders`: the page's
 * own Content-Security-Policy, whose nonce lets its style in, is kept, and
 * every other header is set as on any response.
 */
import { expect, spyOn, test } from 'bun:test';
import { alxia, type Empty, type Middleware } from '@alxia/core';
import { pageHeaders } from './page';
import { secureHeaders } from './secure-headers';

/** GET `/` of `middleware` over a route that throws, asking for HTML. */
async function failingPage(middleware: Middleware<Empty, unknown>) {
	const app = alxia({ dev: true })
		.use(middleware as never)
		.get('/', () => {
			throw new Error('kaboom');
		});
	const error = spyOn(console, 'error').mockImplementation(() => {});
	try {
		const response = await app.request('/', {
			headers: { accept: 'text/html' },
		});
		const policy = response.headers.get('content-security-policy') ?? '';
		const nonce = /style-src 'nonce-([a-f0-9]+)'/.exec(policy)?.[1];
		return { response, policy, nonce, body: await response.text() };
	} finally {
		error.mockRestore();
	}
}

test("the page keeps its own policy, its style's nonce in it, behind secureHeaders", async () => {
	const { response, nonce, body } = await failingPage(secureHeaders());
	expect(response.status).toBe(500);
	expect(nonce).toBeDefined();
	expect(body).toContain(`<style nonce="${nonce}">`);
	expect(response.headers.get('x-content-type-options')).toBe('nosniff');
});

test('the page keeps its own policy behind pageHeaders, its Cache-Control too', async () => {
	const { response, policy, nonce, body } = await failingPage(
		pageHeaders({ https: false }),
	);
	expect(response.status).toBe(500);
	expect(nonce).toBeDefined();
	expect(policy).not.toContain('strict-dynamic');
	expect(body).toContain(`<style nonce="${nonce}">`);
	expect(response.headers.get('cache-control')).toBe('no-store');
});
