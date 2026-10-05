/**
 * A 500 in dev: an HTML page to a browser, with its own policy; the
 * stack in a JSON body or a problem to any other client; production's
 * answer, unchanged, outside dev. An `HttpError` and a client that left
 * are not 500s, and keep their answers.
 */
import { describe, expect, spyOn, test } from 'bun:test';
import { alxia } from '../app/alxia';
import { HttpError } from '../errors/errors';
import { prefersHtml } from './failure';

const BROWSER =
	'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8';

class Kaboom extends Error {
	override name = 'Kaboom';
}

const failing = (options: Parameters<typeof alxia>[0]) =>
	alxia(options)
		.get('/todos/:id', () => {
			throw new Kaboom('the <db> is down');
		})
		.get('/missing', () => {
			throw new HttpError(404, { error: 'no such todo' });
		});

async function quietly<T>(run: () => Promise<T>): Promise<T> {
	const error = spyOn(console, 'error').mockImplementation(() => {});
	try {
		return await run();
	} finally {
		error.mockRestore();
	}
}

describe('a 500 in dev', () => {
	test('a browser gets a page: the error, the request, the stack, the app’s own frames marked', async () => {
		const response = await quietly(() =>
			failing({ dev: true }).request('/todos/7', {
				headers: { accept: BROWSER },
			}),
		);
		expect(response.status).toBe(500);
		expect(response.headers.get('content-type')).toBe(
			'text/html;charset=utf-8',
		);
		expect(response.headers.get('cache-control')).toBe('no-store');
		const html = await response.text();
		expect(html).toStartWith('<!doctype html>');
		expect(html).toContain('<h1>Kaboom</h1>');
		expect(html).toContain('the &lt;db&gt; is down');
		expect(html).toContain('<dd>GET</dd>');
		expect(html).toContain('<dd>/todos/7</dd>');
		expect(html).toContain('<dd>/todos/:id</dd>');
		expect(html).toMatch(/<li class="app">at .*failure\.spec\.ts:\d+/);
		// The source around the frame that threw, its line marked.
		expect(html).toMatch(/<mark>\s+\d+\s+throw new Kaboom/);
		expect(html).not.toMatch(/<script|<link|https?:\/\/(?!localhost)/);
	});

	test('its style is let in by its own policy, through a nonce of its own each time', async () => {
		const served = failing({ dev: true });
		const policies = await quietly(async () => {
			const found: string[] = [];
			for (let i = 0; i < 2; i++) {
				const response = await served.request('/todos/7', {
					headers: { accept: BROWSER },
				});
				const policy = response.headers.get('content-security-policy') ?? '';
				const nonce = /'nonce-([a-f0-9]+)'/.exec(policy)?.[1];
				expect(policy).toStartWith("default-src 'none'; style-src 'nonce-");
				expect(await response.text()).toContain(`<style nonce="${nonce}">`);
				found.push(policy);
			}
			return found;
		});
		expect(policies[0]).not.toBe(policies[1]);
	});

	test('a JSON client gets the stack beside the error, in json and problem alike', async () => {
		const json = await quietly(() =>
			failing({ dev: true }).request('/todos/7', {
				headers: { accept: 'application/json' },
			}),
		);
		const body = (await json.json()) as { error: string; stack: string };
		expect(body.error).toBe('internal');
		expect(body.stack).toStartWith('Kaboom: the <db> is down\n');
		const problem = await quietly(() =>
			failing({ dev: true, errors: 'problem' }).request('/todos/7'),
		);
		expect(problem.headers.get('content-type')).toBe(
			'application/problem+json',
		);
		expect(await problem.json()).toMatchObject({
			status: 500,
			detail: 'The server failed to answer the request',
			stack: expect.stringContaining('Kaboom: the <db> is down'),
		});
	});

	test('what is thrown need not be an Error', async () => {
		const app = alxia({ dev: true }).get('/', () => {
			throw 'a string';
		});
		const response = await quietly(() => app.request('/'));
		expect(await response.json()).toEqual({
			error: 'internal',
			stack: 'a string',
		});
	});

	test('an HttpError keeps its answer, a browser’s included', async () => {
		const response = await failing({ dev: true }).request('/missing', {
			headers: { accept: BROWSER },
		});
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ error: 'no such todo' });
	});
});

describe('a 500 outside dev', () => {
	test('says no more than that the server failed, to a browser too', async () => {
		for (const accept of [BROWSER, 'application/json']) {
			const response = await quietly(() =>
				failing({ dev: false }).request('/todos/7', { headers: { accept } }),
			);
			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({ error: 'internal' });
		}
		const problem = await quietly(() =>
			failing({ dev: false, errors: 'problem' }).request('/todos/7', {
				headers: { accept: BROWSER },
			}),
		);
		expect(await problem.json()).not.toHaveProperty('stack');
	});
});

describe('prefersHtml', () => {
	test("a browser's navigation does; fetch's default and an API client do not", () => {
		expect(prefersHtml(BROWSER)).toBe(true);
		expect(prefersHtml('text/html')).toBe(true);
		expect(prefersHtml('*/*')).toBe(false);
		expect(prefersHtml(null)).toBe(false);
		expect(prefersHtml('application/json')).toBe(false);
		expect(prefersHtml('application/json, text/html;q=0.5')).toBe(false);
		expect(prefersHtml('text/html;q=0, */*')).toBe(false);
		expect(
			prefersHtml('application/graphql-response+json, text/html;q=0.9'),
		).toBe(false);
	});
});
