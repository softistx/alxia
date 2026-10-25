import { describe, expect, test } from 'bun:test';
import { jsonActions } from './json-actions';

const post = (headers: Record<string, string>, body = '{"a":1}') =>
	new Request('http://ui.test/todos/demo/list', {
		method: 'POST',
		headers,
		body,
	});

const statusOf = (promise: Promise<unknown>) =>
	promise.then(
		() => 200,
		(error: { init?: { status?: number } }) => error.init?.status,
	);

const messageOf = (promise: Promise<unknown>) =>
	promise.then(
		() => undefined,
		(error: { data?: unknown }) => error.data,
	);

const json = { 'content-type': 'application/json' };

describe('readJson', () => {
	const { readJson } = jsonActions();

	test('reads a same-origin JSON body', async () => {
		const request = post({ ...json, origin: 'http://ui.test' });
		expect(await readJson(request)).toEqual({ a: 1 });
	});

	test('reads a body that carries neither Origin nor Sec-Fetch-Site', async () => {
		expect(await readJson(post(json))).toEqual({ a: 1 });
		expect(await readJson(post({ ...json, 'sec-fetch-site': 'none' }))).toEqual(
			{ a: 1 },
		);
	});

	test('refuses another origin and a cross-site fetch: 403', async () => {
		const evil = post({ ...json, origin: 'http://evil.test' });
		expect(await statusOf(readJson(evil))).toBe(403);
		expect(await messageOf(readJson(evil))).toBe('Cross-site request refused');
		const cross = post({ ...json, 'sec-fetch-site': 'cross-site' });
		expect(await statusOf(readJson(cross))).toBe(403);
	});

	test('refuses a form or text body: 415', async () => {
		const text = post({ 'content-type': 'text/plain' });
		expect(await statusOf(readJson(text))).toBe(415);
		expect(await messageOf(readJson(text))).toBe('Expected a JSON body');
		const form = post({ 'content-type': 'application/x-www-form-urlencoded' });
		expect(await statusOf(readJson(form))).toBe(415);
	});

	test('refuses malformed JSON: 400', async () => {
		const bad = post(json, '{');
		expect(await statusOf(readJson(bad))).toBe(400);
		expect(await messageOf(readJson(bad))).toBe('Malformed JSON body');
	});
});

describe('origin', () => {
	const from = (actions: ReturnType<typeof jsonActions>, origin: string) =>
		statusOf(actions.readJson(post({ ...json, origin })));

	test('behind a proxy, the origin option is the one a request must come from', async () => {
		const actions = jsonActions({ origin: 'https://app.example.test' });
		expect(await from(actions, 'https://app.example.test')).toBe(200);
		expect(await from(actions, 'http://ui.test')).toBe(403);
	});

	test('a getter is read at each request, and undefined falls back to the request', async () => {
		let origin: string | undefined = 'https://app.example.test';
		const actions = jsonActions({ origin: () => origin });
		expect(await from(actions, 'https://app.example.test')).toBe(200);
		origin = undefined;
		expect(await from(actions, 'http://ui.test')).toBe(200);
		expect(await from(actions, 'https://app.example.test')).toBe(403);
	});
});

describe('requireJsonPost', () => {
	const { requireJsonPost } = jsonActions();
	const thrown = (request: Request) => {
		try {
			requireJsonPost(request);
		} catch (error) {
			return error as Response;
		}
		return undefined;
	};

	test('a native post (before hydration) goes back to the page, its search kept', () => {
		const response = thrown(
			new Request('http://ui.test/sign-in/code?next=%2Ftodos', {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
			}),
		);
		expect(response?.status).toBe(302);
		expect(response?.headers.get('location')).toBe(
			'/sign-in/code?next=%2Ftodos',
		);
	});

	test('a JSON post goes on', () => {
		const request = new Request('http://ui.test/account', {
			method: 'POST',
			headers: json,
		});
		expect(thrown(request)).toBeUndefined();
	});
});
