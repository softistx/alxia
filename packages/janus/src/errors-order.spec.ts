/**
 * `janusErrors()` given before the middlewares that settle — i18n's —
 * and the session that throws: the error still reaches it, and is
 * answered as janus says, never a 500.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { createI18n } from '@alxia/i18n';
import { resources } from '@nxgt/i18n';
import { authOf } from '../test/app';
import { janusErrors } from './errors';
import { session } from './session';

const i18n = createI18n({ resources, fallback: 'en' });

/** A session lookup that fails: what `session()` throws, a `JanusError` janus answers 503. */
const down = { headers: { cookie: 'janus-session=abc' } };

describe('janusErrors(), then i18n, then session()', () => {
	test('the session store down is the 503 janus answers, not a 500', async () => {
		const { auth, outage } = authOf();
		outage.on = true;
		const app = alxia()
			.use(janusErrors())
			.use(i18n)
			.use(session(auth, { type: 'patient', required: true }))
			.get('/me', ({ user, reply }) => reply(200, { name: user.name }));
		const response = await app.request('/me', down);
		expect(response.status).toBe(503);
		expect(((await response.json()) as { code: string }).code).toBe(
			'STORE_FAILED',
		);
	});

	test('i18n first: the same 503', async () => {
		const { auth, outage } = authOf();
		outage.on = true;
		const app = alxia()
			.use(i18n)
			.use(janusErrors())
			.use(session(auth, { type: 'patient', required: true }))
			.get('/me', ({ user, reply }) => reply(200, { name: user.name }));
		expect((await app.request('/me', down)).status).toBe(503);
	});
});
