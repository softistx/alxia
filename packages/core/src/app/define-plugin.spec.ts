import { describe, expect, expectTypeOf, test } from 'bun:test';
import { type Alxia, alxia, type ContextOf, type RoutesOf } from './alxia';
import { definePlugin } from './define-plugin';
import type { BaseContext, Empty, ProvidedBy, RequiresOf } from './types';

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

/**
 * A factory that infers its requirement from the callback it is given, as
 * `@alxia/language`'s `resolve` and `@alxia/janus`'s `load` do.
 */
function audit<Ctx extends object = BaseContext>(
	who: (ctx: BaseContext & Ctx) => string,
) {
	return definePlugin<RequiresOf<Ctx>>()((app) =>
		app.derive((ctx) => ({
			// `use` has checked that the app gives what `who` reads.
			actor: (who as (ctx: BaseContext) => string)(ctx),
		})),
	);
}

describe('RequiresOf', () => {
	test('is what the annotation adds to BaseContext, Empty when nothing', () => {
		expectTypeOf<RequiresOf<BaseContext & { user: User }>>().toEqualTypeOf<{
			user: User;
		}>();
		expectTypeOf<RequiresOf<{ user: User }>>().toEqualTypeOf<{
			user: User;
		}>();
		expectTypeOf<RequiresOf<{ user?: User }>>().toEqualTypeOf<{
			user?: User;
		}>();
		expectTypeOf<RequiresOf<BaseContext>>().toEqualTypeOf<Empty>();
		expectTypeOf<RequiresOf<{ request: Request }>>().toEqualTypeOf<Empty>();
		// A BaseContext key the annotation types otherwise is kept.
		expectTypeOf<RequiresOf<{ url: string }>>().toEqualTypeOf<{
			url: string;
		}>();
	});

	test('an annotated callback makes the plugin require what it reads', async () => {
		const byUser = audit(({ user }: BaseContext & { user: User }) => user.id);
		const app = alxia()
			.use(session)
			.use(byUser)
			.get('/', ({ actor, reply }) => reply(200, actor));
		expect(
			await (await app.request('/', { headers: { 'x-user': 'ada' } })).text(),
		).toBe('ada');
		const _refused = () => {
			// @ts-expect-error the plugin reads "user", which this app's context does not give
			alxia().use(byUser);
			const byUrl = audit(({ url }: { url: string }) => url);
			// @ts-expect-error the plugin reads "url", which this app's context gives with another type
			alxia().use(byUrl);
		};
		expect(_refused).toBeFunction();
	});

	test('a callback annotated any is refused on every app, by its name', () => {
		expectTypeOf<RequiresOf<any>>().toEqualTypeOf<{
			readonly '~any': "the plugin's callback reads its context as any: annotate what it reads, or leave it unannotated";
		}>();
		expectTypeOf<RequiresOf<any, 'who'>>().toEqualTypeOf<{
			readonly '~any': "the plugin's who reads its context as any: annotate what it reads, or leave it unannotated";
		}>();
		// A key annotated any is a key read: only an app that gives it passes.
		expectTypeOf<RequiresOf<{ user: any }>>().toEqualTypeOf<{ user: any }>();
		// Any string key as any reads anything too.
		expectTypeOf<RequiresOf<Record<string, any>>>().toEqualTypeOf<
			RequiresOf<any>
		>();
		expectTypeOf<
			RequiresOf<BaseContext & { [key: string]: any }>
		>().toEqualTypeOf<RequiresOf<any>>();
		// never is no any: refused as before, by ProvidedBy's own message.
		expectTypeOf<RequiresOf<never>>().not.toEqualTypeOf<RequiresOf<any>>();
		const byRecord = audit((ctx: Record<string, any>) => String(ctx['user']));
		const loose = audit((ctx: any) => String(ctx.user));
		const _refused = () => {
			// @ts-expect-error the plugin's callback reads its context as any
			alxia().use(loose);
			// @ts-expect-error the plugin's callback reads its context as any, whatever the app gives
			alxia().use(session).use(loose);
			// @ts-expect-error the plugin's callback reads its context as any, through an index signature
			alxia().use(byRecord);
		};
		expect(_refused).toBeFunction();
	});

	test('a callback annotated unknown or object requires nothing', async () => {
		const byUnknown = audit((ctx: unknown) => typeof ctx);
		const byObject = audit((ctx: object) => String('url' in ctx));
		expectTypeOf(byUnknown['~requires']).toEqualTypeOf<Empty>();
		expectTypeOf(byObject['~requires']).toEqualTypeOf<Empty>();
		const app = alxia()
			.use(byUnknown)
			.get('/unknown', ({ actor, reply }) => reply(200, actor))
			.use(byObject)
			.get('/object', ({ actor, reply }) => reply(200, actor));
		expect(await (await app.request('/unknown')).text()).toBe('object');
		expect(await (await app.request('/object')).text()).toBe('true');
	});

	test('a callback annotated Record<string, unknown> is refused, as before', () => {
		const byRecord = audit((ctx: Record<string, unknown>) => typeof ctx['url']);
		const _refused = () => {
			// @ts-expect-error a string index of unknown is a key no app's context gives
			alxia().use(byRecord);
		};
		expect(_refused).toBeFunction();
	});

	test('an unannotated callback requires nothing', async () => {
		const byPath = audit((ctx) => ctx.url.pathname);
		const app = alxia()
			.use(byPath)
			.get('/here', ({ actor, reply }) => reply(200, actor));
		expect(await (await app.request('/here')).text()).toBe('/here');
	});
});
