import { describe, expect, test } from 'bun:test';
import { alxia, type BaseContext } from '@alxia/core';
import { alxiaContext, alxiaOf, reactRouter } from '@alxia/react-router';
import { RouterContextProvider } from 'react-router';
import { greetingContext } from '../fixture/app/context';
import { type Base, makeBase } from '../fixture/base';
import { browser } from '../test/fixture';
import { build, loadBuild } from '../test/react-router-helpers';

loadBuild();

describe('the context', () => {
	test('getLoadContext gets the typed context and the provider, alxiaContext already set', async () => {
		const seen: unknown[] = [];
		const app = makeBase().plugin((app) =>
			reactRouter(app, {
				build,
				getLoadContext: (ctx, context) => {
					seen.push(ctx.user?.name, context.get(alxiaContext) === ctx);
				},
			}),
		);
		await app.request('/', { headers: { ...browser, 'x-user': 'Di' } });
		expect(seen).toEqual(['Di', true]);
	});

	test("a key made in app/ is not the build's own: the loader reads its default", async () => {
		const app = makeBase().plugin((app) =>
			reactRouter(app, {
				build,
				getLoadContext: (_ctx, context) =>
					context.set(greetingContext, 'from the server'),
			}),
		);
		const html = await (await app.request('/', { headers: browser })).text();
		expect(html).toContain('<p id="greeting">unset</p>');
	});

	test('alxiaOf outside reactRouter() says so', () => {
		expect(() => alxiaOf<Base>(new RouterContextProvider())).toThrow(
			'this request has no alxia context',
		);
	});

	test('alxiaOf is typed by the app before the catch-all', () => {
		const typed = (context: RouterContextProvider) => {
			const ctx = alxiaOf<Base>(context);
			const name: string | undefined = ctx.user?.name;
			const route: string = ctx.route;
			// @ts-expect-error: nothing derives `tenant`
			ctx.tenant;
			// @ts-expect-error: `user` is null without the header
			ctx.user.name;
			// @ts-expect-error: the type argument is an app
			alxiaOf<{ user: string }>(context);
			return { name, route };
		};
		expect(typed).toBeFunction();
	});

	test('getLoadContext reads only what the middlewares before it built', () => {
		const typed = () => {
			const base = alxia().derive(() => ({ user: { id: '1' } }));
			base.plugin((app) =>
				reactRouter(app, { build, getLoadContext: ({ user }) => void user.id }),
			);
			base.plugin((app) =>
				reactRouter(app, {
					build,
					// @ts-expect-error: nothing before it derives `tenant`
					getLoadContext: ({ tenant }) => void tenant,
				}),
			);
			alxia()
				.plugin((app) =>
					reactRouter(app, {
						build,
						// @ts-expect-error: `user` is derived after the catch-all
						getLoadContext: ({ user }) => void user,
					}),
				)
				.derive(() => ({ user: 1 }));
			// An annotated parameter is read as what the app must build:
			// narrower than the app's context is fine, wider is refused.
			base.plugin((app) =>
				reactRouter(app, {
					build,
					getLoadContext: (ctx: BaseContext & { user: { id: string } }) =>
						void ctx.user.id,
				}),
			);
			base.plugin((app) =>
				// @ts-expect-error: nothing before it derives `tenant`
				reactRouter(app, {
					build,
					getLoadContext: (ctx: BaseContext & { tenant: string }) =>
						void ctx.tenant,
				}),
			);
		};
		expect(typed).toBeFunction();
	});
});
