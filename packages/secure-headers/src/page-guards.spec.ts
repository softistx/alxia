/** What `pageHeaders` refuses or ignores in its options, and what it freezes. */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { PAGE_DIRECTIVES, pageHeaders } from './page';

/** The headers of GET `/` behind `pageHeaders(options)`. */
async function headersOf(options: Parameters<typeof pageHeaders>[0]) {
	const app = alxia()
		.use(pageHeaders(options))
		.get('/', ({ reply }) => reply(200, ''));
	return (await app.request('/')).headers;
}

describe('an explicit undefined keeps the preset', () => {
	test('cacheControl', async () => {
		const headers = await headersOf({
			https: false,
			cacheControl: undefined,
		} as never);
		expect(headers.get('cache-control')).toBe('private, no-store');
	});

	test('referrerPolicy', async () => {
		const headers = await headersOf({
			https: false,
			referrerPolicy: undefined,
		} as never);
		expect(headers.get('referrer-policy')).toBe(
			'strict-origin-when-cross-origin',
		);
	});

	test('strictTransportSecurity, off without https', async () => {
		const headers = await headersOf({
			https: false,
			strictTransportSecurity: undefined,
		} as never);
		expect(headers.get('strict-transport-security')).toBeNull();
	});

	test('strictTransportSecurity, the default with https', async () => {
		const headers = await headersOf({
			https: true,
			strictTransportSecurity: undefined,
		} as never);
		expect(headers.get('strict-transport-security')).toBe(
			'max-age=31536000; includeSubDomains',
		);
	});
});

describe('the directives a page policy cannot lose', () => {
	const reasons = {
		'default-src': 'it covers frame, media and child sources',
		'base-uri':
			'it has no fallback, so an injected <base> would redirect nonced relative scripts',
		'object-src': 'it blocks plugin content',
	};

	for (const [name, why] of Object.entries(reasons)) {
		test(`${name} is refused with false and with true`, () => {
			const message = `pageHeaders(): ${name} cannot be removed from a page policy: ${why}, so give it a list of sources`;
			for (const value of [false, true]) {
				expect(() =>
					pageHeaders({ https: false, directives: { [name]: value } }),
				).toThrow(message);
			}
		});

		test(`${name} given undefined keeps the preset's list`, async () => {
			expect(() =>
				pageHeaders({ https: false, directives: { [name]: undefined } }),
			).not.toThrow();
			const headers = await headersOf({
				https: false,
				directives: { [name]: undefined },
			});
			expect(headers.get('content-security-policy')).toContain(`${name} '`);
		});

		test(`${name} accepts a list`, () => {
			expect(() =>
				pageHeaders({ https: false, directives: { [name]: ["'none'"] } }),
			).not.toThrow();
		});
	}
});

test('undefined keeps the preset for a directive that may be removed', async () => {
	const headers = await headersOf({
		https: false,
		directives: { 'manifest-src': undefined },
	});
	expect(headers.get('content-security-policy')).toContain(
		"manifest-src 'self'",
	);
});

describe('PAGE_DIRECTIVES', () => {
	test('is frozen, and so is each list', () => {
		expect(Object.isFrozen(PAGE_DIRECTIVES)).toBe(true);
		expect(Object.isFrozen(PAGE_DIRECTIVES['script-src'])).toBe(true);
		expect(Object.values(PAGE_DIRECTIVES).every(Object.isFrozen)).toBe(true);
	});
});
