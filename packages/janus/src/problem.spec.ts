/**
 * Under `alxia({ errors: 'problem' })`, what janus answers is a problem:
 * `janusErrors()`'s, its code an extension; a required session's 401; a
 * permission's 401, 404 and 403. The default keeps the bodies of before.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { authOf, setup } from '../test/app';
import { janusErrors } from './errors';
import { byParam, permission } from './permission';
import { session } from './session';

const PROBLEM = 'application/problem+json';

describe('janus, errors: problem', () => {
	test('janusErrors(): the store down is a 503 problem, its code an extension', async () => {
		const { auth, outage } = authOf();
		outage.on = true;
		const app = alxia({ errors: 'problem' })
			.use(janusErrors(), session(auth, { required: true }))
			.get('/me', ({ reply }) => reply(200));
		const response = await app.request('/me', {
			headers: { cookie: 'janus-session=abc' },
		});
		expect(response.status).toBe(503);
		expect(response.headers.get('content-type')).toBe(PROBLEM);
		expect(await response.json()).toEqual({
			type: 'about:blank',
			title: 'Service Unavailable',
			status: 503,
			detail: 'Service Unavailable',
			instance: '/me',
			code: 'STORE_FAILED',
		});
	});

	test("a required session's 401 is a problem", async () => {
		const { auth } = authOf();
		const app = alxia({ errors: 'problem' })
			.use(session(auth, { required: true }))
			.get('/me', ({ reply }) => reply(200));
		const response = await app.request('/me');
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			type: 'about:blank',
			title: 'Unauthorized',
			status: 401,
			detail: 'The request has no session',
			instance: '/me',
		});
	});

	test("a permission's 401, 404 and 403 are problems", async () => {
		const { access } = setup();
		const records = new Map([['r1', { id: 'r1', doctorId: null }]]);
		const app = alxia({ errors: 'problem' })
			.derive(({ request }) => ({
				member:
					request.headers.get('x-member') === 'p1'
						? { type: 'patient' as const, id: 'p1' }
						: null,
			}))
			.group('/records/:id', (group) =>
				group
					.use(
						permission(
							access,
							'view',
							'record',
							byParam('id', (id) => records.get(id) ?? null),
							{
								subject: ({
									member,
								}: {
									member: { type: 'patient'; id: string } | null;
								}) => member,
							},
						),
					)
					.get('/', ({ reply }) => reply(200)),
			);
		const member = { headers: { 'x-member': 'p1' } };
		const anonymous = await app.request('/records/r1');
		expect(anonymous.status).toBe(401);
		expect(anonymous.headers.get('content-type')).toBe(PROBLEM);
		const missing = await app.request('/records/r9', member);
		expect(await missing.json()).toMatchObject({
			status: 404,
			title: 'Not Found',
			detail: 'No record is found here',
		});
		const denied = await app.request('/records/r1', member);
		expect(await denied.json()).toMatchObject({
			status: 403,
			title: 'Forbidden',
			detail: 'The view permission on this record is not granted',
		});
	});

	test('the default keeps the bodies of before', async () => {
		const { auth } = authOf();
		const app = alxia()
			.use(session(auth, { required: true }))
			.get('/me', ({ reply }) => reply(200));
		expect(await (await app.request('/me')).json()).toEqual({
			error: 'unauthenticated',
		});
	});
});
