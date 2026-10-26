import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { thrown } from '../../test/session/flow';
import { linksFor, PATH, posting } from '../../test/session/links';

const { links } = linksFor();

describe('statePath and ended', () => {
	test('statePath holds the state alone', () => {
		expect(links.statePath('/invitations/accept', 'linked')).toBe(
			'/invitations/accept?state=linked',
		);
		expect(links.statePath(PATH, 'a b&c')).toBe(`${PATH}?state=a+b%26c`);
	});

	test('ended replaces the history entry, with the headers given', () => {
		const response = links.ended(PATH, 'linked', { 'X-A': '1' });
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe(`${PATH}?state=linked`);
		expect(response.headers.get('x-remix-replace')).toBe('true');
		expect(response.headers.get('x-a')).toBe('1');
	});

	test('a path that is not a path of this site is refused, without what follows ? or #', () => {
		const shown: Record<string, string> = {
			'https://evil.test/x': 'https://evil.test/x',
			'//evil.test': '//evil.test',
			'/a?token=t0k3n': '/a?…',
			'/a#t0k3n': '/a?…',
		};
		for (const [path, printed] of Object.entries(shown)) {
			const error = (() => {
				try {
					links.statePath(path, 'invalid');
				} catch (e) {
					return e as Error;
				}
				throw new Error('expected a throw');
			})();
			expect(error).toBeInstanceOf(TypeError);
			expect(error.message).toBe(
				`statePath(): a token page's path must be a path of this site with no query or fragment, starting with a single "/"; got ${JSON.stringify(printed)}.`,
			);
			expect(error.message).not.toContain('t0k3n');
		}
	});

	test('spendToken checks the path before it runs anything, and names itself', async () => {
		let ran = false;
		const error = await thrown(() =>
			links.spendToken(
				async () => {
					ran = true;
				},
				{
					request: posting(),
					language: 'en',
					path: '/a?token=t0k3n',
					states: {},
				},
			),
		);
		expect(error).toEqual(
			new TypeError(
				`spendToken(): a token page's path must be a path of this site with no query or fragment, starting with a single "/"; got "/a?…".`,
			),
		);
		expect(ran).toBe(false);
	});

	test('linkArgs names itself, and prints nothing after ? or #', async () => {
		const error = await thrown(() =>
			links.linkArgs(
				z.object({ token: z.string() }),
				posting(),
				'/a?token=t0k3n',
			),
		);
		expect(error).toEqual(
			new TypeError(
				`linkArgs(): a token page's path must be a path of this site with no query or fragment, starting with a single "/"; got "/a?…".`,
			),
		);
	});

	test('a redirect to an end state carries the token page’s headers', () => {
		const response = links.ended(PATH, 'invalid');
		expect(response.headers.get('referrer-policy')).toBe('no-referrer');
		expect(response.headers.get('x-robots-tag')).toBe('noindex, nofollow');
	});
});
