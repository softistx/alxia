import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia, type BaseContext } from '@alxia/core';
import { ada, password, reads, setup, signUp } from '../test/app';
import { byParam, permission } from './permission';

describe('janusErrors', () => {
	test('refusals answered with their status and a safe body', async () => {
		const { app } = setup();
		await signUp(app);
		expect((await signUp(app)).response.status).toBe(409);
		const wrong = await app.request('/signin', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ email: ada.email, password: 'wrong password' }),
		});
		expect(wrong.status).toBe(401);
		expect(await wrong.json()).toEqual({ code: 'CREDENTIALS_INVALID' });
	});
});

describe('permission', () => {
	test('403 to a denial, 404 to nothing loaded, the object to an allowed subject', async () => {
		const { app, access, auth } = setup();
		const { token } = await signUp(app);
		const headers = { authorization: `Bearer ${token}` };
		expect((await app.request('/records/r1', { headers })).status).toBe(403);
		expect((await app.request('/records/gone', { headers })).status).toBe(404);
		const user = await auth.patient.findByLogin(ada.email);
		if (user === null) throw new Error('no user');
		await access.grant({ type: 'record', id: 'r1' }, 'owners', user);
		const allowed = await app.request('/records/r1', { headers });
		expect(await allowed.json()).toEqual({ title: 'Blood test' });
		expect((await app.request('/records/r1')).status).toBe(401);
	});

	test('subject, load and ctx read what an earlier plugin adds, typed by their parameters', async () => {
		const { access, auth } = setup();
		const user = await auth.patient.signUp({ ...ada, password });
		await access.grant({ type: 'record', id: 'r1' }, 'owners', user.user);
		interface Tenant {
			readonly records: ReadonlyMap<
				string,
				{ readonly id: string; readonly doctorId: string | null }
			>;
		}
		const tenant: Tenant = {
			records: new Map([['r1', { id: 'r1', doctorId: null }]]),
		};
		const edit = permission(
			access,
			'edit',
			'record',
			({ tenant: current, pathParams }: BaseContext & { tenant: Tenant }) =>
				current.records.get(pathParams['id'] ?? '') ?? null,
			{
				subject: ({ member }: { member: typeof user.user | null }) => member,
				ctx: ({ locked }: { locked: boolean }) => ({ locked }),
			},
		);
		expectTypeOf(reads(edit)).toEqualTypeOf<{
			tenant: Tenant;
			member: typeof user.user | null;
			locked: boolean;
		}>();
		const app = alxia()
			.derive(({ request }) => ({
				tenant,
				member: request.headers.get('x-member') === 'ada' ? user.user : null,
				locked: request.headers.get('x-locked') === 'yes',
			}))
			.group('/records/:id', (records) =>
				records
					.use(edit)
					.get('/', ({ object, reply }) => reply(200, { id: object.id })),
			);
		const status = async (path: string, headers: Record<string, string>) =>
			(await app.request(path, { headers })).status;
		expect(await status('/records/r1', {})).toBe(401);
		expect(await status('/records/gone', { 'x-member': 'ada' })).toBe(404);
		expect(
			await status('/records/r1', { 'x-member': 'ada', 'x-locked': 'yes' }),
		).toBe(403);
		expect(await status('/records/r1', { 'x-member': 'ada' })).toBe(200);
	});

	test('the default subject is no requirement: without session() a request throws, a 500', async () => {
		const { access } = setup();
		const app = alxia().group('/records/:id', (records) =>
			records
				.use(
					permission(
						access,
						'view',
						'record',
						byParam('id', (id) => ({ id, doctorId: null })),
					),
				)
				.get('/', ({ object, reply }) => reply(200, object.id)),
		);
		const errors: unknown[] = [];
		const original = console.error;
		console.error = (...args: unknown[]) => errors.push(args);
		try {
			expect((await app.request('/records/r1')).status).toBe(500);
		} finally {
			console.error = original;
		}
		expect(String(errors.flat())).toContain('no user in the context');
	});
});
