import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { type CspDirectives, csp } from './csp';
import { NONCE } from './nonce';
import { PAGE_DIRECTIVES, pageHeaders } from './page';

const PINNED =
	"default-src 'self'; script-src 'self' 'nonce-{alxia}' 'strict-dynamic'; style-src-elem 'self' 'nonce-{alxia}'; style-src-attr 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests";

const NONCE_SOURCE = /'nonce-([A-Za-z0-9+/]{22}==)'/;

/** The directives of a policy, by name. */
function directivesOf(policy: string) {
	return new Map(
		policy.split('; ').map((directive) => {
			const [name = '', ...sources] = directive.split(' ');
			return [name, sources] as const;
		}),
	);
}

function pages(https: boolean) {
	return alxia()
		.use(pageHeaders({ https }))
		.get('/page', ({ nonce, reply }) => reply(200, nonce))
		.get('/own', ({ reply }) =>
			reply(200, '', {
				headers: {
					'content-security-policy': "default-src 'none'",
					'referrer-policy': 'no-referrer',
				},
			}),
		);
}

describe('PAGE_DIRECTIVES', () => {
	const production = csp({
		...PAGE_DIRECTIVES,
		'upgrade-insecure-requests': true,
	});
	const dev = csp(PAGE_DIRECTIVES);

	test('the policy is the pinned string, byte for byte', () => {
		expect(production).toBe(PINNED);
		expect(production).toBe(`${dev}; upgrade-insecure-requests`);
	});

	test('every directive, once, each with its sources', () => {
		expect(Object.fromEntries(directivesOf(dev))).toEqual({
			'default-src': ["'self'"],
			'script-src': ["'self'", NONCE, "'strict-dynamic'"],
			'style-src-elem': ["'self'", NONCE],
			'style-src-attr': ["'unsafe-inline'"],
			'img-src': ["'self'"],
			'font-src': ["'self'"],
			'connect-src': ["'self'"],
			'worker-src': ["'self'"],
			'manifest-src': ["'self'"],
			'object-src': ["'none'"],
			'base-uri': ["'none'"],
			'form-action': ["'self'"],
			'frame-ancestors': ["'none'"],
		});
	});

	test("never 'unsafe-eval', nor 'unsafe-inline' for scripts", () => {
		expect(production).not.toContain("'unsafe-eval'");
		expect(directivesOf(production).get('script-src')).not.toContain(
			"'unsafe-inline'",
		);
	});
});

describe('pageHeaders', () => {
	const app = pages(false);

	test('the policy names the nonce the routes read: 128 random bits, base64', async () => {
		const response = await app.request('/page');
		const policy = response.headers.get('content-security-policy') ?? '';
		const nonce = NONCE_SOURCE.exec(policy)?.[1];
		expect(nonce).toBeDefined();
		expect(await response.text()).toBe(nonce as string);
		expect(atob(nonce as string)).toHaveLength(16);
		expect(policy).toBe(
			csp(PAGE_DIRECTIVES).replaceAll(NONCE, `'nonce-${nonce}'`),
		);
	});

	test('a fresh nonce on every response', async () => {
		const nonces = new Set<string>();
		for (let i = 0; i < 20; i++) {
			nonces.add(await (await app.request('/page')).text());
		}
		expect(nonces.size).toBe(20);
	});

	test('HSTS and upgrade-insecure-requests with https only', async () => {
		const plain = await app.request('/page');
		expect(plain.headers.get('strict-transport-security')).toBeNull();
		expect(plain.headers.get('content-security-policy')).not.toContain(
			'upgrade-insecure-requests',
		);
		const secure = await pages(true).request('/page');
		expect(secure.headers.get('strict-transport-security')).toBe(
			'max-age=31536000; includeSubDomains',
		);
		expect(secure.headers.get('content-security-policy')).toEndWith(
			'; upgrade-insecure-requests',
		);
	});

	test('referrer, isolation headers and the defaults it keeps', async () => {
		const { headers } = await app.request('/page');
		expect(headers.get('referrer-policy')).toBe(
			'strict-origin-when-cross-origin',
		);
		expect(headers.get('x-frame-options')).toBe('DENY');
		expect(headers.get('x-content-type-options')).toBe('nosniff');
		expect(headers.get('cross-origin-opener-policy')).toBe('same-origin');
		expect(headers.get('cross-origin-resource-policy')).toBe('same-origin');
		expect(headers.get('origin-agent-cluster')).toBe('?1');
		expect(headers.get('x-dns-prefetch-control')).toBe('off');
		expect(headers.get('x-permitted-cross-domain-policies')).toBe('none');
		expect(headers.get('cross-origin-embedder-policy')).toBeNull();
	});

	test('pages are never cached', async () => {
		expect((await app.request('/page')).headers.get('cache-control')).toBe(
			'private, no-store',
		);
	});

	test("a route's own policy and referrer policy win", async () => {
		const { headers } = await app.request('/own');
		expect(headers.get('content-security-policy')).toBe("default-src 'none'");
		expect(headers.get('referrer-policy')).toBe('no-referrer');
	});

	test('a 404 is covered too', async () => {
		const response = await app.request('/nowhere');
		expect(response.status).toBe(404);
		expect(response.headers.get('content-security-policy')).toMatch(
			NONCE_SOURCE,
		);
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});

	test('other options pass through, and win over the preset', async () => {
		const custom = alxia()
			.use(
				pageHeaders({
					https: true,
					referrerPolicy: 'no-referrer',
					cacheControl: false,
					strictTransportSecurity: 'max-age=60',
				}),
			)
			.get('/', ({ reply }) => reply(200, ''));
		const { headers } = await custom.request('/');
		expect(headers.get('referrer-policy')).toBe('no-referrer');
		expect(headers.get('cache-control')).toBeNull();
		expect(headers.get('strict-transport-security')).toBe('max-age=60');
	});
});

describe('directives', () => {
	async function policyOf(directives: CspDirectives, https = false) {
		const app = alxia()
			.use(pageHeaders({ https, directives }))
			.get('/', ({ reply }) => reply(200, ''));
		const policy = (await app.request('/')).headers.get(
			'content-security-policy',
		);
		return directivesOf(policy ?? '');
	}

	test('a list replaces the preset one', async () => {
		const policy = await policyOf({
			'img-src': ["'self'", 'https://img.example'],
		});
		expect(policy.get('img-src')).toEqual(["'self'", 'https://img.example']);
		expect(policy.get('font-src')).toEqual(["'self'"]);
	});

	test('false removes a directive', async () => {
		const policy = await policyOf({ 'manifest-src': false });
		expect(policy.has('manifest-src')).toBe(false);
		expect(policy.has('worker-src')).toBe(true);
	});

	test('a directive the preset lacks is added', async () => {
		const policy = await policyOf({ 'media-src': ["'self'"] });
		expect(policy.get('media-src')).toEqual(["'self'"]);
	});

	test('an upgrade-insecure-requests given wins over https', async () => {
		expect(
			(await policyOf({ 'upgrade-insecure-requests': false }, true)).has(
				'upgrade-insecure-requests',
			),
		).toBe(false);
		expect(
			(await policyOf({ 'upgrade-insecure-requests': true }, false)).has(
				'upgrade-insecure-requests',
			),
		).toBe(true);
	});

	test('a script-src without NONCE is refused', () => {
		const message =
			"pageHeaders(): script-src has no NONCE: a page script runs only with the response's nonce, so write script-src with NONCE in directives, such as [\"'self'\", NONCE, \"'strict-dynamic'\"]";
		expect(() =>
			pageHeaders({ https: false, directives: { 'script-src': ["'self'"] } }),
		).toThrow(message);
		expect(() =>
			pageHeaders({ https: false, directives: { 'script-src': false } }),
		).toThrow(message);
	});

	test('a script-src-elem without NONCE is refused, and accepted with it', () => {
		const message =
			'pageHeaders(): script-src-elem has no NONCE: script elements follow it instead of script-src, so add NONCE to it, or give false to remove it';
		expect(() =>
			pageHeaders({
				https: false,
				directives: { 'script-src-elem': ["'self'"] },
			}),
		).toThrow(message);
		expect(() =>
			pageHeaders({
				https: false,
				directives: { 'script-src-elem': ["'self'", NONCE] },
			}),
		).not.toThrow();
		expect(() =>
			pageHeaders({ https: false, directives: { 'script-src-elem': false } }),
		).not.toThrow();
	});
});

describe('types', () => {
	test("the policy and the nonce switch are the preset's", () => {
		// @ts-expect-error contentSecurityPolicy is written through directives
		pageHeaders({ https: false, contentSecurityPolicy: "default-src 'self'" });
		// @ts-expect-error a page policy always carries a nonce
		pageHeaders({ https: false, nonce: false });
		// @ts-expect-error https is required
		pageHeaders({});
	});
});
