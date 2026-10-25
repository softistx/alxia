import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { csp } from './csp';
import { NONCE } from './nonce';
import { secureHeaders } from './secure-headers';

describe('csp', () => {
	test('writes the directives in insertion order', () => {
		expect(
			csp({
				'img-src': ["'self'", 'data:'],
				'default-src': ["'none'"],
				'x-custom': ['a'],
			}),
		).toBe("img-src 'self' data:; default-src 'none'; x-custom a");
	});

	test('true gives a bare directive; false and undefined leave it out', () => {
		expect(
			csp({
				'default-src': ["'self'"],
				'upgrade-insecure-requests': true,
				sandbox: false,
				'object-src': undefined,
			}),
		).toBe("default-src 'self'; upgrade-insecure-requests");
	});

	test('a list value is written after the name, as sandbox tokens', () => {
		expect(csp({ sandbox: ['allow-scripts', 'allow-forms'] })).toBe(
			'sandbox allow-scripts allow-forms',
		);
	});

	test('NONCE passes through, and is replaced for each request', async () => {
		const policy = csp({
			'script-src': ["'self'", NONCE],
			'style-src-elem': ["'self'", NONCE],
		});
		expect(policy).toBe(
			`script-src 'self' ${NONCE}; style-src-elem 'self' ${NONCE}`,
		);
		const app = alxia()
			.use(secureHeaders({ nonce: true, contentSecurityPolicy: policy }))
			.get('/', ({ nonce, reply }) => reply(200, { nonce }));
		const seen = new Set<string>();
		for (let i = 0; i < 3; i++) {
			const response = await app.request('/');
			const { nonce } = (await response.json()) as { nonce: string };
			expect(response.headers.get('content-security-policy')).toBe(
				`script-src 'self' 'nonce-${nonce}'; style-src-elem 'self' 'nonce-${nonce}'`,
			);
			seen.add(nonce);
		}
		expect(seen.size).toBe(3);
	});

	test('refuses an empty source list', () => {
		expect(() => csp({ 'img-src': [] })).toThrow(
			new TypeError(
				`csp(): img-src has no source: write ["'none'"] to allow nothing, or false to leave it out`,
			),
		);
	});

	test('refuses a name that is not lowercase letters, digits and hyphens, starting with a letter', () => {
		expect(() => csp({ 'Script-Src': ["'self'"] })).toThrow(
			new TypeError(
				'csp(): "Script-Src" is not a directive name: write lowercase letters, digits and hyphens, starting with a letter, as in "script-src"',
			),
		);
		expect(() => csp({ 'img src': ["'self'"] })).toThrow(TypeError);
		for (const name of ['-', '-x', '9x']) {
			expect(() => csp({ [name]: ["'self'"] })).toThrow(TypeError);
		}
	});

	test('a name may hold digits after its first letter', () => {
		expect(csp({ x1: ["'self'"] })).toBe("x1 'self'");
	});

	test('refuses a source that holds ";", "," or whitespace', () => {
		for (const source of ["'self'; script-src *", 'a,b', 'a b', '']) {
			expect(() => csp({ 'img-src': [source] })).toThrow(
				new TypeError(
					`csp(): img-src has the source "${source}", which is empty or holds ";", "," or a space: a source is one token, so split a list into several sources, and write a comma inside a URL as %2C`,
				),
			);
		}
	});

	test('refuses a policy with no directive left', () => {
		const message =
			'csp(): no directive is left: give at least one, such as { "default-src": ["\'none\'"] }';
		expect(() => csp({})).toThrow(new TypeError(message));
		expect(() => csp({ sandbox: false, 'img-src': undefined })).toThrow(
			new TypeError(message),
		);
	});

	test('a source list is an array, not a string', () => {
		// Type only: never called.
		const wrong = () =>
			// @ts-expect-error a string is not a list of sources
			csp({ 'img-src': 'self' });
		expect(wrong).toBeFunction();
	});
});
