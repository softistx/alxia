import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { NONCE } from './nonce';
import {
	type SecureHeaders,
	type SecureHeadersOptions,
	secureHeaders,
} from './secure-headers';

const PAGE_POLICY = "default-src 'self'; script-src 'self'; style-src 'self'";

/** The nonce a policy allows, from its first `'nonce-…'` source. */
const nonceIn = (policy: string | null) =>
	policy?.match(/'nonce-([^']+)'/)?.[1];

const page = () =>
	alxia()
		.use(secureHeaders({ nonce: true, contentSecurityPolicy: PAGE_POLICY }))
		.get('/', ({ nonce, reply }) => reply(200, nonce));

describe('secureHeaders({ nonce: true })', () => {
	test('the header carries the nonce the context gives the route', async () => {
		const response = await page().request('/');
		const nonce = await response.text();
		expect(response.headers.get('content-security-policy')).toBe(
			`default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self'`,
		);
	});

	test('the nonce is fresh on every request: 128 random bits, base64', async () => {
		const app = page();
		const nonces = new Set<string>();
		for (let i = 0; i < 50; i++) {
			const response = await app.request('/');
			const nonce = await response.text();
			expect(nonce).toMatch(/^[A-Za-z0-9+/]{22}==$/);
			expect(nonceIn(response.headers.get('content-security-policy'))).toBe(
				nonce,
			);
			nonces.add(nonce);
		}
		expect(nonces.size).toBe(50);
	});

	test('NONCE places it, every time it is named, and nowhere else', async () => {
		const app = alxia()
			.use(
				secureHeaders({
					nonce: true,
					contentSecurityPolicy: `script-src 'self'; style-src 'self' ${NONCE}; style-src-elem ${NONCE}`,
				}),
			)
			.get('/', ({ nonce, reply }) => reply(200, nonce));
		const response = await app.request('/');
		const nonce = await response.text();
		expect(response.headers.get('content-security-policy')).toBe(
			`script-src 'self'; style-src 'self' 'nonce-${nonce}'; style-src-elem 'nonce-${nonce}'`,
		);
	});

	test('without NONCE, it goes to script-src and script-src-elem, whatever their case', async () => {
		const app = alxia()
			.use(
				secureHeaders({
					nonce: true,
					contentSecurityPolicy:
						"Script-Src 'self' ; script-src-elem 'self'; style-src 'unsafe-inline'",
				}),
			)
			.get('/', ({ nonce, reply }) => reply(200, nonce));
		const response = await app.request('/');
		const nonce = await response.text();
		expect(response.headers.get('content-security-policy')).toBe(
			`Script-Src 'self' 'nonce-${nonce}'; script-src-elem 'self' 'nonce-${nonce}'; style-src 'unsafe-inline'`,
		);
	});

	test('the same nonce under a bodyLimit, which hands the route a Request of its own', async () => {
		const app = alxia()
			.use(secureHeaders({ nonce: true, contentSecurityPolicy: PAGE_POLICY }))
			.post('/', { bodyLimit: 64 }, ({ nonce, reply }) => reply(200, nonce));
		const response = await app.request('/', { method: 'POST', body: 'hi' });
		expect(nonceIn(response.headers.get('content-security-policy'))).toBe(
			await response.text(),
		);
	});

	test('a response no route made gets a nonce too; a policy a route set is kept', async () => {
		const app = alxia()
			.use(secureHeaders({ nonce: true, contentSecurityPolicy: PAGE_POLICY }))
			.get('/own', ({ reply }) =>
				reply(200, 'own', {
					headers: { 'content-security-policy': "default-src 'none'" },
				}),
			);
		const missing = await app.request('/nope');
		expect(missing.status).toBe(404);
		expect(nonceIn(missing.headers.get('content-security-policy'))).toMatch(
			/^[A-Za-z0-9+/]{22}==$/,
		);
		const own = await app.request('/own');
		expect(own.headers.get('content-security-policy')).toBe(
			"default-src 'none'",
		);
		expect(own.headers.get('x-content-type-options')).toBe('nosniff');
	});

	test('the other headers are the ones nonce: false sends', async () => {
		const headersOf = async (response: Response) =>
			[...response.headers].filter(
				([name]) =>
					![
						'content-security-policy',
						'content-type',
						'content-length',
					].includes(name),
			);
		const plain = alxia()
			.use(secureHeaders({ contentSecurityPolicy: PAGE_POLICY }))
			.get('/', ({ reply }) => reply(200, 'x'));
		expect(await headersOf(await page().request('/'))).toEqual(
			await headersOf(await plain.request('/')),
		);
	});

	test('nowhere to put it, or no policy to put it in, is refused at once', () => {
		expect(() => secureHeaders({ nonce: true })).toThrow(
			`secureHeaders: nonce is on, but the content-security-policy has no script-src to add it to: write one, or place NONCE where the nonce goes (the policy is "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")`,
		);
		expect(() =>
			secureHeaders({ nonce: true, contentSecurityPolicy: false }),
		).toThrow(
			'secureHeaders: nonce is on, but contentSecurityPolicy is false: a nonce is only read through the content-security-policy header',
		);
		expect(() =>
			secureHeaders({ contentSecurityPolicy: `script-src ${NONCE}` }),
		).toThrow(
			'secureHeaders: contentSecurityPolicy names NONCE, but nonce is off: give nonce: true',
		);
	});

	test('nonce is typed on the routes after it, and only with nonce: true', () => {
		const typed = page();
		void typed;
		alxia()
			// @ts-expect-error a route before the plugin has no nonce
			.get('/before', ({ nonce, reply }) => reply(200, String(nonce)))
			.use(secureHeaders({ nonce: true, contentSecurityPolicy: PAGE_POLICY }))
			.get('/after', ({ nonce, reply }) => reply(200, nonce satisfies string));
		alxia()
			.use(secureHeaders({ contentSecurityPolicy: PAGE_POLICY }))
			// @ts-expect-error no nonce without nonce: true
			.get('/', ({ nonce, reply }) => reply(200, String(nonce)));
		// Options typed by the exported interface pick the plugin without a nonce.
		const options: SecureHeadersOptions = { referrerPolicy: 'same-origin' };
		const plain: SecureHeaders = secureHeaders(options);
		void plain;
		const on = true as boolean;
		const refused = () =>
			// @ts-expect-error a boolean that may be false: say true or false
			secureHeaders({ nonce: on, contentSecurityPolicy: PAGE_POLICY });
		expect(refused).not.toThrow();
	});
});
