/**
 * The dev error page of `@alxia/core` behind `secureHeaders`: the page's
 * own Content-Security-Policy, whose nonce lets its style in, is kept, and
 * every other header is set as on any response.
 */
import { expect, spyOn, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { secureHeaders } from './secure-headers';

test("the page keeps its own policy, its style's nonce in it, behind secureHeaders", async () => {
	const app = alxia({ dev: true })
		.use(secureHeaders())
		.get('/', () => {
			throw new Error('kaboom');
		});
	const error = spyOn(console, 'error').mockImplementation(() => {});
	try {
		const response = await app.request('/', {
			headers: { accept: 'text/html' },
		});
		expect(response.status).toBe(500);
		const policy = response.headers.get('content-security-policy') ?? '';
		const nonce = /style-src 'nonce-([a-f0-9]+)'/.exec(policy)?.[1];
		expect(nonce).toBeDefined();
		expect(await response.text()).toContain(`<style nonce="${nonce}">`);
		expect(response.headers.get('x-content-type-options')).toBe('nosniff');
	} finally {
		error.mockRestore();
	}
});
