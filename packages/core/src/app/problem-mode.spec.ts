/**
 * `alxia({ errors: 'problem' })`: an escaped `HttpError`, a refusal's 400
 * and 413, and a 500 as RFC 9457 problems, with every member. The router's
 * answers and the default are `problem-routing.spec.ts`'s.
 */
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { HttpError } from '../errors/errors';
import { alxia } from './alxia';
import { validate } from './validate';

const PROBLEM = 'application/problem+json';

async function quietly<T>(run: () => Promise<T>): Promise<T> {
	const original = console.error;
	console.error = () => {};
	try {
		return await run();
	} finally {
		console.error = original;
	}
}

const app = alxia({ errors: 'problem' })
	.get('/teapot', () => {
		throw new HttpError(418, { error: 'teapot' });
	})
	.get('/taken', () => {
		throw new HttpError(
			409,
			{ error: 'taken' },
			{
				type: 'https://example.com/problems/taken',
				title: 'Login taken',
				detail: 'ada is taken',
				extensions: { login: 'ada', status: 200, type: 'ignored' },
			},
		);
	})
	.get('/boom', () => {
		throw new Error('secret connection string');
	})
	.post(
		'/users',
		validate({ body: z.object({ name: z.string() }) }),
		({ reply }) => reply(201),
	)
	.post('/small', { bodyLimit: 4 }, async ({ request, reply }) =>
		reply(200, await request.text()),
	);

describe('errors: problem', () => {
	test('an HttpError escaping is a problem: the reason phrase, the path', async () => {
		const response = await app.request('/teapot?token=x');
		expect(response.status).toBe(418);
		expect(response.headers.get('content-type')).toBe(PROBLEM);
		expect(await response.json()).toEqual({
			type: 'about:blank',
			title: "I'm a teapot",
			status: 418,
			detail: "I'm a teapot",
			instance: '/teapot',
		});
	});

	test("an HttpError's type, title, detail and extensions, which never replace a member", async () => {
		const response = await app.request('/taken');
		expect(await response.json()).toEqual({
			type: 'https://example.com/problems/taken',
			title: 'Login taken',
			status: 409,
			detail: 'ada is taken',
			instance: '/taken',
			login: 'ada',
		});
	});

	test('a 500 says no more than that the server failed', async () => {
		const response = await quietly(() => app.request('/boom'));
		expect(response.status).toBe(500);
		expect(response.headers.get('content-type')).toBe(PROBLEM);
		const body = await response.json();
		expect(body).toEqual({
			type: 'about:blank',
			title: 'Internal Server Error',
			status: 500,
			detail: 'The server failed to answer the request',
			instance: '/boom',
		});
		expect(JSON.stringify(body)).not.toContain('secret');
	});

	test('a refused request is a 400 problem with its issues', async () => {
		const response = await app.request('/users', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: '{}',
		});
		expect(response.status).toBe(400);
		expect(response.headers.get('content-type')).toBe(PROBLEM);
		const body = await response.json();
		expect(body).toMatchObject({
			type: 'about:blank',
			title: 'Bad Request',
			status: 400,
			detail: "The request's body is invalid",
			instance: '/users',
		});
		expect(body.issues[0]).toMatchObject({ target: 'body', path: ['name'] });
	});

	test('a body past its limit is a 413 problem with the limit', async () => {
		const response = await app.request('/small', {
			method: 'POST',
			body: 'too long',
		});
		expect(response.status).toBe(413);
		expect(await response.json()).toEqual({
			type: 'about:blank',
			title: 'Content Too Large',
			status: 413,
			detail: 'The request body is larger than the limit of 4 bytes',
			instance: '/small',
			limit: 4,
		});
	});
});
