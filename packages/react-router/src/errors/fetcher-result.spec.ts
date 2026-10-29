import { describe, expect, test } from 'bun:test';
import { refusal, strictErrors } from '../../test/errors/refusal';

const errors = strictErrors();

const apiError = (code: string, status: number) =>
	refusal(code, code, { http: { status } });

/** What `data()` carries: its body and status. */
const body = (result: unknown) =>
	result as { data: Record<string, unknown>; init: { status: number } };

describe('fetcherResult', () => {
	test("the mutation's value, with what the request was about", async () => {
		expect(
			await errors.fetcherResult('en', { intent: 'x' }, async () => ({
				count: 2,
			})),
		).toEqual({ ok: true, intent: 'x', count: 2 });
	});

	test('an API refusal is its worded message, with its status', async () => {
		const result = body(
			await errors.fetcherResult('en', { intent: 'x' }, () =>
				Promise.reject(apiError('todos.errors.title-taken', 409)),
			),
		);
		expect(result.data).toEqual({
			ok: false,
			intent: 'x',
			error: 'Another todo already has this title.',
		});
		expect(result.init.status).toBe(409);
	});

	test("an API it cannot reach is the page's message, not the error page", async () => {
		const result = body(
			await errors.fetcherResult('en', { intent: 'x' }, () =>
				Promise.reject(new Response('unreachable', { status: 503 })),
			),
		);
		expect(result.data).toEqual({
			ok: false,
			intent: 'x',
			error: 'The service is unavailable.',
		});
		expect(result.init.status).toBe(503);
	});

	test('a 401 or another failure goes to the error page', async () => {
		const unauthenticated = errors.fetcherResult('en', {}, () =>
			Promise.reject(apiError('todos.errors.unauthenticated', 401)),
		);
		await expect(unauthenticated).rejects.toMatchObject({
			init: { status: 401 },
		});
		const boom = new Error('boom');
		await expect(
			errors.fetcherResult('en', {}, () => Promise.reject(boom)),
		).rejects.toBe(boom);
	});
});

describe('fetcherResult reword', () => {
	const failing = (error: unknown) => () => Promise.reject(error);

	test("a module's words replace the catalogue's, the status stays", async () => {
		const seen: unknown[] = [];
		const result = body(
			await errors.fetcherResult(
				'en',
				{ intent: 'x' },
				failing(apiError('todos.errors.title-taken', 409)),
				{
					reword: (error) => {
						seen.push(error.code);
						return 'This title is already used here.';
					},
				},
			),
		);
		expect(seen).toEqual(['todos.errors.title-taken']);
		expect(result.data).toEqual({
			ok: false,
			intent: 'x',
			error: 'This title is already used here.',
		});
		expect(result.init.status).toBe(409);
	});

	test("undefined keeps the API's own worded message", async () => {
		const result = body(
			await errors.fetcherResult(
				'en',
				{},
				failing(apiError('todos.errors.title-taken', 409)),
				{ reword: () => undefined },
			),
		);
		expect(result.data.error).toBe('Another todo already has this title.');
		expect(result.init.status).toBe(409);
	});

	test('is not applied to an unreachable API', async () => {
		let called = false;
		const result = body(
			await errors.fetcherResult(
				'en',
				{},
				failing(new Response('unreachable', { status: 503 })),
				{
					reword: () => {
						called = true;
						return 'reworded';
					},
				},
			),
		);
		expect(called).toBe(false);
		expect(result.data.error).toBe('The service is unavailable.');
		expect(result.init.status).toBe(503);
	});

	test('is not applied to a 401, which goes to the error page', async () => {
		let called = false;
		await expect(
			errors.fetcherResult(
				'en',
				{},
				failing(apiError('todos.errors.unauthenticated', 401)),
				{
					reword: () => {
						called = true;
						return 'reworded';
					},
				},
			),
		).rejects.toMatchObject({ init: { status: 401 } });
		expect(called).toBe(false);
	});
});

describe('fetcherRefusal', () => {
	test("is apiRefusal's, and throws what it does not word", () => {
		const error = apiError('todos.errors.title-taken', 409);
		expect(errors.fetcherRefusal(error, 'en')).toEqual({
			message: 'Another todo already has this title.',
			status: 409,
		});
		const boom = new Error('boom');
		expect(() => errors.fetcherRefusal(boom, 'en')).toThrow(boom);
	});
});

describe('the route option', () => {
	const gone = () =>
		new Response(null, { status: 410, headers: { 'x-request-id': 'r-1' } });
	const route = { statuses: new Set([410]) };

	test('fetcherRefusal throws what routeError makes of it with the option', () => {
		const response = gone();
		expect(() => errors.fetcherRefusal(response, 'en')).toThrow();
		try {
			errors.fetcherRefusal(response, 'en', route);
		} catch (thrown) {
			expect(body(thrown)).toMatchObject({
				data: { requestId: 'r-1' },
				init: { status: 410 },
			});
		}
		expect.assertions(2);
	});

	test('fetcherResult passes it on', async () => {
		const thrown = await errors
			.fetcherResult('en', {}, () => Promise.reject(gone()), route)
			.catch((error) => error);
		expect(body(thrown).init.status).toBe(410);
		const plain = await errors
			.fetcherResult('en', {}, () => Promise.reject(gone()))
			.catch((error) => error);
		expect(plain).toBeInstanceOf(Response);
	});

	test("a per-call reword replaces the refusal's message, keeping its status", async () => {
		const result = body(
			await errors.fetcherResult(
				'en',
				{ intent: 'x' },
				() => Promise.reject(apiError('todos.errors.title-taken', 409)),
				{ reword: () => 'Pick another title.' },
			),
		);
		expect(result.data).toEqual({
			ok: false,
			intent: 'x',
			error: 'Pick another title.',
		});
		expect(result.init.status).toBe(409);
	});

	test('a reword that returns undefined keeps the worded message and sees the caught error', async () => {
		const failure = apiError('todos.errors.title-taken', 409);
		const seen: unknown[] = [];
		const result = body(
			await errors.fetcherResult('en', {}, () => Promise.reject(failure), {
				reword: (error) => {
					seen.push(error);
					return undefined;
				},
			}),
		);
		expect(result.data['error']).toBe('Another todo already has this title.');
		expect(seen).toEqual([failure]);
	});

	test('reword is not called for a failure that goes to the error page', async () => {
		let called = false;
		const boom = new Error('boom');
		await expect(
			errors.fetcherResult('en', {}, () => Promise.reject(boom), {
				reword: () => {
					called = true;
					return 'x';
				},
			}),
		).rejects.toBe(boom);
		expect(called).toBe(false);
	});
});
