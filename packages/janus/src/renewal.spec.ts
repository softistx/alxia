import { describe, expect, test } from 'bun:test';
import { alxia, HttpError, validate } from '@alxia/core';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';
import { ada, cookieOf, DAY, password, setup, signUp } from '../test/app';
import { session } from './session';

describe('session: renewal, sign-out and an outage', () => {
	test('a renewal behind two session() is sent once', async () => {
		const { auth, clock } = setup();
		await auth.patient.signUp({ ...ada, password });
		const { token } = await auth.patient.signIn({ email: ada.email, password });
		const app = alxia()
			.use(session(auth))
			.use(session(auth, { required: true }))
			.get('/me', ({ reply }) => reply.ok('me'));
		clock.advance(2 * DAY);
		const renewed = await app.request('/me', {
			headers: { cookie: `janus-session=${token}` },
		});
		expect(
			renewed.headers
				.getSetCookie()
				.filter((value) => value.startsWith('janus-session=')),
		).toHaveLength(1);
	});

	test('a renewal rides a refusal and an error answer too', async () => {
		const { auth, clock } = setup();
		await auth.patient.signUp({ ...ada, password });
		const { token } = await auth.patient.signIn({ email: ada.email, password });
		const app = alxia()
			.use(session(auth, { required: true }))
			.post(
				'/notes',
				validate({ body: z.object({ title: z.string() }) }),
				({ reply }) => reply(201, 'ok'),
			)
			.get('/teapot', () => {
				throw new HttpError(418, 'teapot');
			});
		const renewedOn = (response: Response) =>
			response.headers
				.getSetCookie()
				.some((value) => value.startsWith('janus-session='));
		clock.advance(2 * DAY);
		const refused = await app.request('/notes', {
			method: 'POST',
			headers: {
				cookie: `janus-session=${token}`,
				'content-type': 'application/json',
			},
			body: '{}',
		});
		expect(refused.status).toBe(400);
		expect(renewedOn(refused)).toBe(true);
		clock.advance(2 * DAY);
		const teapot = await app.request('/teapot', {
			headers: { cookie: `janus-session=${token}` },
		});
		expect(teapot.status).toBe(418);
		expect(renewedOn(teapot)).toBe(true);
	});

	test('auth.send sets the device cookie under the name session() gives', async () => {
		const key = Buffer.from(
			crypto.getRandomValues(new Uint8Array(32)),
		).toString('base64');
		const accounts = janus({
			user: z.object({ email: z.email(), name: z.string() }),
			password: { login: 'email' },
			store: createMemoryStores(),
			hasher: scryptHasher({ cost: 10 }),
			devices: { keys: [{ id: 'k1', key }] },
		});
		await accounts.signUp({ ...ada, password });
		const app = alxia()
			.use(session(accounts, { device: { name: 'my-device' } }))
			.post(
				'/signin',
				validate({
					body: z.object({ email: z.string(), password: z.string() }),
				}),
				async ({ body, auth, reply }) => {
					const signedIn = await accounts.signIn(body, { device: auth.device });
					return reply.ok({ id: auth.send(signedIn).id });
				},
			);
		const first = await app.request('/signin', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: ada.email, password }),
		});
		const device = first.headers
			.getSetCookie()
			.find((value) => value.startsWith('my-device='));
		expect(device).toContain('HttpOnly');
		expect(
			first.headers
				.getSetCookie()
				.some((value) => value.startsWith('janus-device=')),
		).toBe(false);
	});

	test('a renewed session is sent again, only to a cookie client', async () => {
		const { app, clock } = setup();
		const { token } = await signUp(app);
		clock.advance(2 * DAY);
		const viaCookie = await app.request('/me', {
			headers: { cookie: `janus-session=${token}` },
		});
		expect(cookieOf(viaCookie)).toBeDefined();
		clock.advance(2 * DAY);
		const viaBearer = await app.request('/me', {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(viaBearer.status).toBe(200);
		expect(cookieOf(viaBearer)).toBeUndefined();
	});

	test('sign-out revokes the session and clears the cookie', async () => {
		const { app } = setup();
		const { token } = await signUp(app);
		const out = await app.request('/signout', {
			method: 'POST',
			headers: { cookie: `janus-session=${token}` },
		});
		expect(await out.json()).toBe(true);
		expect(cookieOf(out)).toContain('Max-Age=0');
		expect(
			(
				await app.request('/me', {
					headers: { cookie: `janus-session=${token}` },
				})
			).status,
		).toBe(401);
	});

	test('an outage is a 503, never a 401', async () => {
		const { app, outage } = setup();
		const { token } = await signUp(app);
		outage.on = true;
		const response = await app.request('/me', {
			headers: { cookie: `janus-session=${token}` },
		});
		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ code: 'STORE_FAILED' });
	});
});
