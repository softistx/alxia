/**
 * `bearer()`'s 401 follows the app's error format: an RFC 9457 problem
 * under `alxia({ errors: 'problem' })`, its challenge kept.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { z } from 'zod';
import { bearer } from './bearer';
import { createJwt } from './jwt';

const jwt = createJwt({ secret: 'a-secret-of-at-least-thirty-two-bytes!' });

describe('bearer, errors: problem', () => {
	const app = alxia({ errors: 'problem' })
		.use(
			bearer({ jwt, schema: z.object({ sub: z.string(), role: z.string() }) }),
		)
		.get('/me', ({ user, reply }) => reply(200, user));

	test('a missing token is a 401 problem, with its challenge', async () => {
		const response = await app.request('/me');
		expect(response.status).toBe(401);
		expect(response.headers.get('content-type')).toBe(
			'application/problem+json',
		);
		expect(response.headers.get('www-authenticate')).toBe('Bearer');
		expect(await response.json()).toEqual({
			type: 'about:blank',
			title: 'Unauthorized',
			status: 401,
			detail: 'The request carries no bearer token',
			instance: '/me',
			reason: 'missing',
		});
	});

	test('refused claims carry their issues', async () => {
		const token = await jwt.sign({ sub: 'ada' });
		const response = await app.request('/me', {
			headers: { authorization: `Bearer ${token}` },
		});
		const body = await response.json();
		expect(body).toMatchObject({
			status: 401,
			detail: 'The bearer token is refused: claims',
			reason: 'claims',
		});
		expect(body.issues[0].path).toEqual(['role']);
	});

	test('the default stays the json body', async () => {
		const plain = alxia()
			.use(bearer({ jwt }))
			.get('/me', ({ reply }) => reply(200));
		const response = await plain.request('/me');
		expect(response.headers.get('content-type')).toBe('application/json');
		expect(await response.json()).toEqual({
			error: 'unauthorized',
			reason: 'missing',
		});
	});
});
