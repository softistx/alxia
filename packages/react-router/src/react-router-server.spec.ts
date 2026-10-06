import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
// By its published name, as the fixture's build imports it: see react-router.spec.ts.
import { alxiaOf, reactRouter } from '@alxia/react-router';
import { RouterContextProvider } from 'react-router';
import type { Base } from '../fixture/base';
import { browser, text } from '../test/fixture';
import { build, loadBuild, served } from '../test/react-router-helpers';
import { open } from '../test/socket';

loadBuild();

/** The fixture served behind `listen`, on a free port. */
function listening() {
	const app = served();
	const server = app.listen({ port: 0, hostname: '127.0.0.1' });
	return { app, server, base: server.url.href };
}

describe('alxiaOf(context).server and context.alxia', () => {
	test('a loader reads context.alxia.user and context.alxia.server: the server listen started', async () => {
		const { app, server, base } = listening();
		try {
			const response = await fetch(new URL('/live', base), {
				headers: { ...browser, 'x-user': 'Ada' },
			});
			const html = text(await response.text());
			expect(html).toContain('<p id="name">Ada</p>');
			expect(html).toContain(`<p id="serving">${server.url.href}</p>`);
		} finally {
			await app.stop(true);
		}
	});

	test('through app.request there is no server: it is undefined', async () => {
		const response = await served().request('/live', { headers: browser });
		expect(text(await response.text())).toContain(
			'<p id="serving">no server</p>',
		);
	});

	test("an action's server.publish reaches a ws route's subscriber", async () => {
		const { app, base } = listening();
		try {
			const { socket, next } = await open(base, '/api/live');
			try {
				expect(await next()).toEqual({ subscribed: 'live' });
				const response = await fetch(new URL('/live.data', base), {
					method: 'POST',
					headers: browser,
					body: new URLSearchParams({ said: 'hello' }),
				});
				expect(response.status).toBe(200);
				expect(await response.text()).toContain('"sent",');
				expect(await next()).toEqual({ said: 'hello' });
			} finally {
				socket.close();
			}
		} finally {
			await app.stop(true);
		}
	});

	test('alxiaOf(context).server is typed Bun.Server<unknown> | undefined', () => {
		const typed = (context: RouterContextProvider) => {
			const server: Bun.Server<unknown> | undefined =
				alxiaOf<Base>(context).server;
			// @ts-expect-error: undefined without a server
			const bare: Bun.Server<unknown> = alxiaOf<Base>(context).server;
			return { server, bare };
		};
		expect(typed).toBeFunction();
	});

	test('context.alxia is what alxiaOf(context) returns, the same object', async () => {
		const seen: unknown[] = [];
		const app = alxia()
			.derive(() => ({ user: { name: 'Bo' } }))
			.plugin((app) =>
				reactRouter(app, {
					build,
					getLoadContext: (ctx, context) => {
						seen.push(context.alxia === ctx, alxiaOf(context) === ctx);
					},
				}),
			);
		await app.request('/', { headers: browser });
		expect(seen).toEqual([true, true]);
	});

	test("outside reactRouter(), context.alxia throws alxiaOf's error", () => {
		const context = new RouterContextProvider();
		expect(() => context.alxia).toThrow('this request has no alxia context');
		// Not an own key: a provider's keys stay React Router's.
		expect(Object.keys(context)).not.toContain('alxia');
	});
});
