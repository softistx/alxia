import { describe, expect, expectTypeOf, test } from 'bun:test';
import { type Alxia, alxia, type ContextOf, type RoutesOf } from './alxia';
import { definePlugin } from './define-plugin';

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
			.use(session)
			.use(tenant)
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
		const app = alxia({ prefix: '/api' }).use(session).use(routes);
		const response = await app.request('/api/me', {
			headers: { 'x-user': 'ada' },
		});
		expect(await response.text()).toBe('ada');
		expect((await app.request('/api/me')).status).toBe(401);
		expectTypeOf<keyof RoutesOf<typeof app>>().toEqualTypeOf<'/api/me'>();
	});

	test('it can be used in a group, and by several apps', async () => {
		const first = alxia()
			.use(session)
			.group('/t', (group) =>
				group
					.use(tenant)
					.get('/', ({ tenant, reply }) => reply(200, tenant?.name ?? '')),
			);
		const second = alxia()
			.use(session)
			.use(tenant)
			.get('/', ({ tenant, reply }) => reply(200, tenant?.name ?? ''));
		const headers = { 'x-user': 'ada' };
		expect(await (await first.request('/t', { headers })).text()).toBe('Acme');
		expect(await (await second.request('/', { headers })).text()).toBe('Acme');
	});

	test('with no requirement, any app may use it', async () => {
		const stamp = definePlugin()((app) =>
			app.onResponse((response) => {
				response.headers.set('x-stamp', '1');
			}),
		);
		const app = alxia()
			.use(stamp)
			.get('/', ({ reply }) => reply(200, 'ok'));
		expect((await app.request('/')).headers.get('x-stamp')).toBe('1');
	});

	test('the app it builds on has the requirement in its context', () => {
		definePlugin<{ user: User }>()((app) => {
			expectTypeOf<ContextOf<typeof app>['user']>().toEqualTypeOf<User>();
			// @ts-expect-error `session` is neither required nor added
			return app.derive(({ session }) => ({ copy: session }));
		});
		const app = alxia().use(session).use(tenant);
		expectTypeOf<ContextOf<typeof app>['tenant']>().toEqualTypeOf<{
			name: string;
		} | null>();
	});

	test('an app that does not give what it reads cannot use it', () => {
		const _refused = () => {
			// @ts-expect-error the plugin reads "user", which this app's context does not give
			alxia().use(tenant);
			const maybe = alxia().derive(() => ({ user: null as User | null }));
			// @ts-expect-error the plugin reads "user", which this app's context gives with another type
			maybe.use(tenant);
			const both = definePlugin<{ user: User; session: string }>()(
				(app) => app,
			);
			// @ts-expect-error one message per key: "user" of another type, "session" not given
			maybe.use(both);
			// @ts-expect-error inside a group, the same check
			alxia().group('/t', (group) => group.use(tenant));
			// @ts-expect-error through a function plugin, the same check
			alxia().use((app) => app.use(tenant));
		};
		expect(_refused).toBeFunction();
	});

	test('an optional requirement passes on an app without the key', () => {
		const greeting = definePlugin<{ user?: { id: string } }>()((app) =>
			app.derive(({ user }) => ({ greeting: `hi ${user?.id ?? 'guest'}` })),
		);
		alxia().use(greeting);
		alxia().use(session).use(greeting);
		const _refused = () => {
			const numeric = alxia().derive(() => ({ user: 1 }));
			// @ts-expect-error the plugin reads "user", which this app's context gives with another type
			numeric.use(greeting);
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
				app.use(tenant);
			// What is chained onto the plugin after `definePlugin` returns is a
			// plain app, unchecked: finish the plugin inside `build`.
			alxia().use(tenant.get('/x', ({ reply }) => reply(200, 'x')));
			return generic;
		};
		expect(_limits).toBeFunction();
	});
});
