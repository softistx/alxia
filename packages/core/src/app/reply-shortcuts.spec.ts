/** The reply shortcuts: `reply.ok`, `reply.notFound`, `reply.html`, … */
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import { responds, validate } from './validate';

describe('reply shortcuts', () => {
	const User = z.object({ id: z.number(), name: z.string() });
	const NotFound = z.object({ error: z.literal('not_found') });

	const free = alxia()
		.get('/ok', ({ reply }) => reply.ok({ id: 1 }))
		.post('/created', ({ reply }) => reply.created({ id: 2 }))
		.delete('/gone', ({ reply }) => reply.noContent())
		.get('/missing', ({ reply }) => reply.notFound({ error: 'not_found' }))
		.get('/page', ({ reply }) =>
			reply.html(200, '<h1>Hi</h1>', { headers: { 'x-page': '1' } }),
		);

	const typed = alxia()
		.get(
			'/users/:id',
			validate({ params: z.object({ id: z.coerce.number() }) }),
			responds({ 200: User, 404: NotFound }),
			({ params, reply }) =>
				params.id === 1
					? reply.ok({ id: 1, name: 'Ada' })
					: reply.notFound({ error: 'not_found' }),
		)
		.delete('/users/:id', responds({ 204: z.undefined() }), ({ reply }) =>
			reply.noContent(),
		)
		.get('/doc', responds({ 200: z.string() }), ({ reply }) =>
			reply.html(200, '<p>doc</p>'),
		);

	test('each is reply(status, body): status, body, headers', async () => {
		const ok = await free.request('/ok');
		expect([ok.status, await ok.json()]).toEqual([200, { id: 1 }]);
		const created = await free.request('/created', { method: 'POST' });
		expect(created.status).toBe(201);
		const gone = await free.request('/gone', { method: 'DELETE' });
		expect([gone.status, await gone.text()]).toEqual([204, '']);
		expect((await free.request('/missing')).status).toBe(404);
		const page = await free.request('/page');
		expect(page.headers.get('content-type')).toBe('text/html;charset=utf-8');
		expect(page.headers.get('x-page')).toBe('1');
		expect(await page.text()).toBe('<h1>Hi</h1>');
	});

	test('with schemas: the declared statuses only, the body checked', async () => {
		expect(await (await typed.request('/users/1')).json()).toEqual({
			id: 1,
			name: 'Ada',
		});
		expect((await typed.request('/users/2')).status).toBe(404);
		expect((await typed.request('/users/1', { method: 'DELETE' })).status).toBe(
			204,
		);
		expect(await (await typed.request('/doc')).text()).toBe('<p>doc</p>');

		alxia().get('/x', responds({ 200: User }), ({ reply }) => {
			// @ts-expect-error no 404 declared: no notFound
			void reply.notFound;
			// @ts-expect-error no 204 declared: no noContent
			void reply.noContent;
			return reply.ok({ id: 1, name: 'Ada' });
		});
		alxia().delete('/y', responds({ 204: z.null() }), ({ reply }) => {
			// @ts-expect-error 204's schema takes no undefined: no noContent
			void reply.noContent;
			return reply(204, null);
		});
		alxia().get('/z', responds({ 200: User }), ({ reply }) => {
			// @ts-expect-error a body the schema refuses
			void reply.ok({ id: 'one', name: 'Ada' });
			// @ts-expect-error html for a status whose schema takes no string
			void reply.html(200, '<p>no</p>');
			return reply.ok({ id: 1, name: 'Ada' });
		});
	});
});
