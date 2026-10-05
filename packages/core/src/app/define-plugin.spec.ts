import { describe, expect, expectTypeOf, test } from 'bun:test';
import { type Alxia, alxia, type ContextOf } from './alxia';
import { definePlugin } from './define-plugin';
import type { Empty, ProvidedBy } from './types';

interface User {
	readonly id: string;
	readonly tenantId: string;
}

const tenants = new Map([['acme', { name: 'Acme' }]]);

/** Reads `user`, which an earlier plugin adds. */
const tenant = definePlugin<{ user: { tenantId: string } }>()((app) =>
	app.derive(({ user }) => ({ tenant: tenants.get(user.tenantId) ?? null })),
);

/** Adds a `user`, or ends the request with a 401. */
const session = alxia().derive(({ request, reply }) => {
	const id = request.headers.get('x-user');
	if (id === null) return reply(401, { error: 'unauthenticated' as const });
	const user: User = { id, tenantId: 'acme' };
	return { user };
});

describe('definePlugin', () => {
	test('its hooks read what the plugin before it added', async () => {
		const app = alxia()
			.plugin(session)
			.plugin(tenant)
			.get('/tenant', ({ tenant, user, reply }) =>
				reply(200, { tenant: tenant?.name ?? null, user: user.id }),
			);
		const response = await app.request('/tenant', {
			headers: { 'x-user': 'ada' },
		});
		expect(await response.json()).toEqual({ tenant: 'Acme', user: 'ada' });
		expect((await app.request('/tenant')).status).toBe(401);
	});

	test('its routes are mounted under the prefix, behind the hooks before it', async () => {
		const routes = definePlugin<{ user: User }>()((app) =>
			app.get('/me', ({ user, reply }) => reply(200, user.id)),
		);
		const app = alxia({ prefix: '/api' }).plugin(session).plugin(routes);
		const response = await app.request('/api/me', {
			headers: { 'x-user': 'ada' },
		});
		expect(await response.text()).toBe('ada');
		expect((await app.request('/api/me')).status).toBe(401);
	});

	test('it can be used in a group, and by several apps', async () => {
		const first = alxia()
			.plugin(session)
			.group('/t', (group) =>
				group
					.plugin(tenant)
					.get('/', ({ tenant, reply }) => reply(200, tenant?.name ?? '')),
			);
		const second = alxia()
			.plugin(session)
			.plugin(tenant)
			.get('/', ({ tenant, reply }) => reply(200, tenant?.name ?? ''));
		const headers = { 'x-user': 'ada' };
		expect(await (await first.request('/t', { headers })).text()).toBe('Acme');
		expect(await (await second.request('/', { headers })).text()).toBe('Acme');
	});

	test('with no requirement, any app may use it', async () => {
		const stamp = definePlugin()((app) =>
			app.use(async (_ctx, next) => {
				const response = await next();
				response.headers.set('x-stamp', '1');
				return response;
			}),
		);
		const app = alxia()
			.plugin(stamp)
			.get('/', ({ reply }) => reply(200, 'ok'));
		expect((await app.request('/')).headers.get('x-stamp')).toBe('1');
	});

	test('the app it builds on has the requirement in its context', () => {
		definePlugin<{ user: User }>()((app) => {
			expectTypeOf<ContextOf<typeof app>['user']>().toEqualTypeOf<User>();
			// @ts-expect-error `session` is neither required nor added
			return app.derive(({ session }) => ({ copy: session }));
		});
		const app = alxia().plugin(session).plugin(tenant);
		expectTypeOf<ContextOf<typeof app>['tenant']>().toEqualTypeOf<{
			name: string;
		} | null>();
	});

	test('an app that does not give what it reads cannot use it', () => {
		const _refused = () => {
			// @ts-expect-error the plugin reads "user", which this app's context does not give
			alxia().plugin(tenant);
			const maybe = alxia().derive(() => ({ user: null as User | null }));
			// @ts-expect-error the plugin reads "user", which this app's context gives with another type
			maybe.plugin(tenant);
			const both = definePlugin<{ user: User; session: string }>()(
				(app) => app,
			);
			// @ts-expect-error one message per key: "user" of another type, "session" not given
			maybe.plugin(both);
			// @ts-expect-error inside a group, the same check
			alxia().group('/t', (group) => group.plugin(tenant));
			// @ts-expect-error through a function plugin, the same check
			alxia().plugin((app) => app.plugin(tenant));
		};
		expect(_refused).toBeFunction();
	});

	test('an optional requirement passes on an app without the key', () => {
		const greeting = definePlugin<{ user?: { id: string } }>()((app) =>
			app.derive(({ user }) => ({ greeting: `hi ${user?.id ?? 'guest'}` })),
		);
		alxia().plugin(greeting);
		alxia().plugin(session).plugin(greeting);
		const _refused = () => {
			const numeric = alxia().derive(() => ({ user: 1 }));
			// @ts-expect-error the plugin reads "user", which this app's context gives with another type
			numeric.plugin(greeting);
		};
		expect(_refused).toBeFunction();
	});

	test('the limits of the check, pinned', () => {
		const _limits = () => {
			// A context that is a type parameter defers the check, so even a
			// bound that gives `user` is refused: type the host concretely.
			const generic = <C extends { user: { tenantId: string } }>(
				app: Alxia<C>,
			) =>
				// @ts-expect-error a generic context cannot be checked
				app.plugin(tenant);
			// What is chained onto the plugin after `definePlugin` returns is a
			// plain app, unchecked: finish the plugin inside `build`.
			alxia().plugin(tenant.get('/x', ({ reply }) => reply(200, 'x')));
			return generic;
		};
		expect(_limits).toBeFunction();
	});
	test('a union requirement, or never, is refused with one message', () => {
		expectTypeOf<
			ProvidedBy<Empty, { a: string } | { b: string }>
		>().toEqualTypeOf<{
			readonly '~requires': "this app's context does not give what the plugin reads";
		}>();
		expectTypeOf<ProvidedBy<Empty, never>>().toEqualTypeOf<{
			readonly '~requires': "this app's context does not give what the plugin reads";
		}>();
	});
});
