/**
 * A 404's hint never names a route behind a guard the request has not
 * passed: a prefixed plugin's, a group's, a `use(path, …)`'s, a route's
 * own. The app-wide middlewares it did pass leave their routes offered.
 */
import { describe, expect, test } from 'bun:test';
import { alxia } from '../app/alxia';
import { defineMiddleware } from '../app/define-middleware';
import type { BaseContext } from '../app/types';

const guard = defineMiddleware(function guard({ request, reply }, next) {
	return request.headers.has('x-pass')
		? next()
		: reply(401, { error: 'unauthorized' as const });
});
const ok = ({ reply }: BaseContext) => reply(200, {});

const guarded = () =>
	alxia({ dev: true })
		.plugin(alxia({ prefix: '/admin' }).use(guard).get('/delete-all-users', ok))
		.group('/ops', (g) => g.use(guard).get('/rotate-keys', ok))
		.use('/internal', guard)
		.get('/internal/dump-db', ok)
		.get('/billing/refund-all', guard, ok)
		.get('/billing/invoices', ok);

const hintOf = async (app: ReturnType<typeof guarded>, path: string) => {
	const response = await app.request(path);
	return { status: response.status, hint: (await response.json()).hint };
};

describe("a 404's hint and the guards", () => {
	test('no route behind a guard is named, wherever the guard stands', async () => {
		const app = guarded();
		for (const [path, secret] of [
			['/admn/delete-all-users', '/admin/delete-all-users'],
			['/op/rotate-keys', '/ops/rotate-keys'],
			['/internl/dump-db', '/internal/dump-db'],
			['/billing/refund-al', '/billing/refund-all'],
		] as const) {
			const { status, hint } = await hintOf(app, path);
			expect(status).toBe(404);
			expect(String(hint)).not.toContain(secret);
		}
	});

	test('a route behind nothing, or behind the app-wide middlewares passed, is', async () => {
		expect(await hintOf(guarded(), '/billing/invoice')).toEqual({
			status: 404,
			hint: 'did you mean GET /billing/invoices?',
		});
		const app = alxia({ dev: true })
			.use(guard)
			.derive(() => ({ who: 'ada' }))
			.get('/todos', ok);
		const asked = await app.request('/todo', { headers: { 'x-pass': '1' } });
		expect((await asked.json()).hint).toBe('did you mean GET /todos?');
	});
});
