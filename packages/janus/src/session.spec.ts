import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia, validate } from '@alxia/core';
import { z } from 'zod';
import { ada, cookieOf, password, setup, signUp, tokenOf } from '../test/app';
import { janusErrors } from './errors';
import { type SessionOptions, session } from './session';

describe('session', () => {
	test('a sign-up sends the cookie, and the session reads the user', async () => {
		const { app } = setup();
		const { response, token } = await signUp(app);
		expect(response.status).toBe(201);
		expect(cookieOf(response)).toContain('HttpOnly');
		expect(JSON.stringify(await response.json())).not.toContain(token);
		const me = await app.request('/me', {
			headers: { cookie: `janus-session=${token}` },
		});
		expect(await me.json()).toEqual({ name: 'Ada Lovelace' });
		const bearer = await app.request('/me', {
			headers: { authorization: `Bearer ${token}` },
		});
		expect(bearer.status).toBe(200);
	});

	test('anonymous is a 401; routes before the session are open', async () => {
		const { app } = setup();
		const anonymous = await app.request('/me');
		expect(anonymous.status).toBe(401);
		expect(await anonymous.json()).toEqual({ error: 'unauthenticated' });
		expect((await app.request('/whoami')).status).toBe(200);
	});

	test('ctx.auth: send, signOut and device, bound to the request', async () => {
		const { auth } = setup();
		await auth.patient.signUp({ ...ada, password });
		const app = alxia()
			.use(janusErrors())
			.use(session(auth, { type: 'patient', device: { name: 'my-device' } }))
			.post(
				'/signin',
				validate({
					body: z.object({ email: z.string(), password: z.string() }),
				}),
				async ({ body, auth: current, reply }) => {
					expectTypeOf(current.device).toEqualTypeOf<string | null>();
					const signedIn = await auth.patient.signIn(body);
					return reply.ok({
						id: current.send(signedIn).id,
						device: current.device,
					});
				},
			)
			.post('/signout', async ({ auth: current, reply }) =>
				reply.ok(await current.signOut()),
			)
			.get('/me', ({ user, reply }) => reply.ok({ name: user?.name ?? null }));

		const signedIn = await app.request('/signin', {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				cookie: 'my-device=d-1',
			},
			body: JSON.stringify({ email: ada.email, password }),
		});
		expect((await signedIn.json()).device).toBe('d-1');
		const token = tokenOf(signedIn);
		expect(token).not.toBe('');
		const cookie = `janus-session=${token}`;
		expect(
			await (await app.request('/me', { headers: { cookie } })).json(),
		).toEqual({ name: 'Ada Lovelace' });

		const out = await app.request('/signout', {
			method: 'POST',
			headers: { cookie },
		});
		expect(await out.json()).toBe(true);
		expect(cookieOf(out)).toContain('janus-session=;');
		expect(
			await (await app.request('/me', { headers: { cookie } })).json(),
		).toEqual({ name: null });
	});

	test('required as a boolean: user may be null, and the 401 is in the type', async () => {
		const { auth } = setup();
		for (const required of [true, false]) {
			const app = alxia()
				.use(session(auth, { required }))
				.get('/me', ({ user, reply }) => {
					const anonymous: typeof user = null; // compiles only if user may be null
					void anonymous;
					return reply(200, { signedIn: user !== null });
				});
			const anonymous = await app.request('/me');
			expect(anonymous.status).toBe(required ? 401 : 200);
		}
		// A wrapper forwarding the options as they are typed compiles too.
		const forwarded = (options: SessionOptions<'patient'>) =>
			session(auth, options);
		expect(forwarded({})).toBeFunction();
	});

	test('session() twice, one instance: a request is looked up once', async () => {
		const { auth, outage } = setup();
		await auth.patient.signUp({ ...ada, password });
		const { token } = await auth.patient.signIn({ email: ada.email, password });
		const lookedUp = { count: 0 };
		const counted = {
			...auth,
			authenticate: ((...args: Parameters<typeof auth.authenticate>) => {
				lookedUp.count++;
				return auth.authenticate(...args);
			}) as typeof auth.authenticate,
		};
		const app = alxia()
			.use(janusErrors())
			.use(session(counted))
			.use(session(counted, { required: true }))
			.get('/me', ({ user, reply }) => reply.ok({ type: user.type }))
			.use(session(counted, { type: 'patient' }))
			.get('/patient', ({ reply }) => reply.ok('patient'));
		const cookie = `janus-session=${token}`;
		expect((await app.request('/me', { headers: { cookie } })).status).toBe(
			200,
		);
		expect(lookedUp.count).toBe(1);
		lookedUp.count = 0;
		await app.request('/patient', { headers: { cookie } });
		expect(lookedUp.count).toBe(2); // another `type` is its own lookup

		// A failed lookup is not kept: the same Request object asks again.
		const request = new Request('http://localhost/me', { headers: { cookie } });
		outage.on = true;
		expect((await app.fetch(request)).status).toBe(503);
		outage.on = false;
		expect((await app.fetch(request)).status).toBe(200);
	});
});
