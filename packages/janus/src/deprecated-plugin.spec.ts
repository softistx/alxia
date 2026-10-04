import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { setup, signUp } from '../test/app';
import { session } from './session';

describe('app.plugin(session()), deprecated', () => {
	test('a route declared after it is guarded, and reads user', async () => {
		const { app: base, auth } = setup();
		const { token } = await signUp(base);
		const app = alxia()
			.plugin(session(auth, { type: 'patient', required: true }))
			.get('/late', ({ user, reply }) => reply(200, user.name));
		expect((await app.request('/late')).status).toBe(401);
		const signed = await app.request('/late', {
			headers: { cookie: `janus-session=${token}` },
		});
		expect(await signed.text()).toBe('Ada Lovelace');
	});

	test('a route declared before it is guarded too, as 0.3 hooks did', async () => {
		const { auth } = setup();
		const app = alxia()
			.get('/early', ({ reply }) => reply(200, 'early'))
			.plugin(session(auth, { required: true }));
		expect((await app.request('/early')).status).toBe(401);
	});
});
