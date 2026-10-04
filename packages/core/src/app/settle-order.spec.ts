/**
 * `settle` does not swallow the error: an observer reads the response it
 * would be answered with, and the error goes on to the middlewares around
 * it. Whatever the order, a try/catch middleware catches it; when none
 * does, the response the observers made is sent.
 */
import { describe, expect, test } from 'bun:test';
import { HttpError } from '../errors/errors';
import { alxia } from './alxia';
import { settle } from './boundary';
import { defineMiddleware } from './define-middleware';

class Teapot extends Error {}

const observer = (name: string) =>
	defineMiddleware(async (ctx, next) => {
		const response = await settle(ctx, next());
		response.headers.append('x-seen', name);
		return response;
	});

const catcher = defineMiddleware(async ({ reply }, next) => {
	try {
		return await next();
	} catch (error) {
		if (error instanceof Teapot)
			return reply(418, { error: 'teapot' as const });
		throw error;
	}
});

const throws = () => {
	throw new Teapot('brewing');
};

describe('a try/catch middleware before a settling observer', () => {
	test('still catches the error, and the observers outside it see its reply', async () => {
		const app = alxia()
			.use(observer('outer'), catcher, observer('inner'))
			.get('/', throws);
		const response = await app.request('/');
		expect(response.status).toBe(418);
		expect(response.headers.get('x-seen')).toBe('outer');
	});

	test('what it does not catch is answered by the observers’ response', async () => {
		const app = alxia()
			.use(catcher, observer('a'), observer('b'))
			.get('/', () => {
				throw new HttpError(409, { error: 'conflict' });
			});
		const response = await app.request('/');
		expect(response.status).toBe(409);
		expect(response.headers.get('x-seen')).toBe('b, a');
	});

	test('a request no route matches: the 404 the observers made', async () => {
		const app = alxia().use(catcher, observer('a'));
		const response = await app.request('/missing');
		expect(response.status).toBe(404);
		expect(response.headers.get('x-seen')).toBe('a');
	});

	test('an observer alone: the response it made, the error on ctx.error', async () => {
		let seen: unknown;
		const reads = defineMiddleware(async (ctx, next) => {
			const response = await settle(ctx, next());
			seen = ctx.error;
			return response;
		});
		const app = alxia().use(reads, observer('a')).get('/', throws);
		const response = await app.request('/');
		expect(response.status).toBe(500);
		expect(response.headers.get('x-seen')).toBe('a');
		expect(seen).toBeInstanceOf(Teapot);
	});
});
