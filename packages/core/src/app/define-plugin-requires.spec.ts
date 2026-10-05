import { describe, expect, expectTypeOf, test } from 'bun:test';
import { alxia } from './alxia';
import { definePlugin } from './define-plugin';
import type { BaseContext, Empty, RequiresOf } from './types';

interface User {
	readonly id: string;
	readonly tenantId: string;
}

/** Adds a `user`, or ends the request with a 401. */
const session = alxia().derive(({ request, reply }) => {
	const id = request.headers.get('x-user');
	if (id === null) return reply(401, { error: 'unauthenticated' as const });
	const user: User = { id, tenantId: 'acme' };
	return { user };
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
			.plugin(session)
			.plugin(byUser)
			.get('/', ({ actor, reply }) => reply(200, actor));
		expect(
			await (await app.request('/', { headers: { 'x-user': 'ada' } })).text(),
		).toBe('ada');
		const _refused = () => {
			// @ts-expect-error the plugin reads "user", which this app's context does not give
			alxia().plugin(byUser);
			const byUrl = audit(({ url }: { url: string }) => url);
			// @ts-expect-error the plugin reads "url", which this app's context gives with another type
			alxia().plugin(byUrl);
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
			alxia().plugin(loose);
			// @ts-expect-error the plugin's callback reads its context as any, whatever the app gives
			alxia().plugin(session).plugin(loose);
			// @ts-expect-error the plugin's callback reads its context as any, through an index signature
			alxia().plugin(byRecord);
		};
		expect(_refused).toBeFunction();
	});

	test('a callback annotated unknown or object requires nothing', async () => {
		const byUnknown = audit((ctx: unknown) => typeof ctx);
		const byObject = audit((ctx: object) => String('url' in ctx));
		expectTypeOf(byUnknown['~requires']).toEqualTypeOf<Empty>();
		expectTypeOf(byObject['~requires']).toEqualTypeOf<Empty>();
		const app = alxia()
			.plugin(byUnknown)
			.get('/unknown', ({ actor, reply }) => reply(200, actor))
			.plugin(byObject)
			.get('/object', ({ actor, reply }) => reply(200, actor));
		expect(await (await app.request('/unknown')).text()).toBe('object');
		expect(await (await app.request('/object')).text()).toBe('true');
	});

	test('a callback annotated Record<string, unknown> is refused, as before', () => {
		const byRecord = audit((ctx: Record<string, unknown>) => typeof ctx['url']);
		const _refused = () => {
			// @ts-expect-error a string index of unknown is a key no app's context gives
			alxia().plugin(byRecord);
		};
		expect(_refused).toBeFunction();
	});

	test('an unannotated callback requires nothing', async () => {
		const byPath = audit((ctx) => ctx.url.pathname);
		const app = alxia()
			.plugin(byPath)
			.get('/here', ({ actor, reply }) => reply(200, actor));
		expect(await (await app.request('/here')).text()).toBe('/here');
	});
});
