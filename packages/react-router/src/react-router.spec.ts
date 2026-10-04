import { beforeAll, describe, expect, test } from 'bun:test';
import { compress } from '@alxia/compress';
import { alxia, type BaseContext } from '@alxia/core';
import { matchesSpec } from '@alxia/openapi';
// The package by its published name, `dist/`, not `./index`: the fixture's
// build imports it so, and the catch-all must set the very `alxiaContext`
// its loaders read.
import {
	alxiaContext,
	alxiaOf,
	isReactRouterRoute,
	reactRouter,
} from '@alxia/react-router';
import { RouterContextProvider, type ServerBuild } from 'react-router';
import { greetingContext } from '../fixture/app/context';
import { type Base, makeBase } from '../fixture/base';
import { BROWSER, CLIENT, fixtureBuild } from '../test/fixture';

let build: ServerBuild;
beforeAll(async () => {
	build = await fixtureBuild();
}, 60_000);

const browser = { 'user-agent': BROWSER };

/** The fixture served as an app would serve it: `/api/health`, then the catch-all. */
function served() {
	return makeBase().plugin((app) =>
		reactRouter(app, { build, client: CLIENT }),
	);
}

/** React's server renderer puts a comment between adjacent text nodes. */
const text = (html: string) => html.replaceAll('<!-- -->', '');

describe('pages', () => {
	test('a document is server rendered, its loader reading what the hooks built', async () => {
		const response = await served().request('/', {
			headers: { ...browser, 'x-user': 'Ada' },
		});
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/html');
		const html = text(await response.text());
		expect(html).toContain('<h1>Hello Ada</h1>');
		expect(html).toContain('<p id="route">/*</p>');
	});

	test('a single-fetch data request reads the same context', async () => {
		const response = await served().request('/_.data', {
			headers: { ...browser, 'x-user': 'Bob' },
		});
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/x-script');
		expect(await response.text()).toContain('"Bob"');
	});

	test("an index route's document action is POST /?index", async () => {
		const response = await served().request('/?index', {
			method: 'POST',
			headers: browser,
			body: new URLSearchParams({ step: '2' }),
		});
		expect(response.status).toBe(200);
		expect(text(await response.text())).toContain('<p id="added">added 2</p>');
	});

	test('POST / is React Router’s 405: the root has no action', async () => {
		const response = await served().request('/', {
			method: 'POST',
			headers: browser,
			body: new URLSearchParams({ step: '2' }),
		});
		expect(response.status).toBe(405);
	});

	test('a single-fetch action answers its data', async () => {
		const response = await served().request('/_.data?index', {
			method: 'POST',
			headers: { ...browser, 'x-user': 'Cy' },
			body: new URLSearchParams({ step: '3' }),
		});
		expect(response.status).toBe(200);
		const body = await response.text();
		expect(body).toContain('"added",3');
		expect(body).toContain('"Cy"');
	});

	test('a redirect keeps both of its cookies', async () => {
		const response = await served().request('/login', {
			method: 'POST',
			headers: browser,
			redirect: 'manual',
		});
		expect(response.status).toBe(302);
		expect(response.headers.get('location')).toBe('/');
		expect(response.headers.getSetCookie()).toEqual([
			'a=1; Path=/; HttpOnly',
			'b=2; Path=/; HttpOnly',
		]);
	});

	test('a single-fetch redirect keeps them too', async () => {
		const response = await served().request('/login.data', {
			method: 'POST',
			headers: browser,
		});
		expect(response.status).toBe(202);
		expect(response.headers.getSetCookie()).toHaveLength(2);
		expect(await response.text()).toContain('"redirect","/"');
	});

	test('a thrown 404 and a route that does not exist are 404 pages', async () => {
		const app = served();
		const thrown = await app.request('/missing', { headers: browser });
		expect(thrown.status).toBe(404);
		expect(text(await thrown.text())).toContain('404 no such thing');
		const nowhere = await app.request('/nowhere', { headers: browser });
		expect(nowhere.status).toBe(404);
		expect(nowhere.headers.get('content-type')).toBe('text/html');
	});

	test('a loader that throws is a 500 page', async () => {
		const response = await served().request('/boom', { headers: browser });
		expect(response.status).toBe(500);
		expect(await response.text()).toContain('<h1>Oops</h1>');
	});

	test('lazy route discovery: /__manifest', async () => {
		const response = await served().request(
			`/__manifest?paths=%2Fslow&version=${build.assets.version}`,
			{ headers: browser },
		);
		expect(response.status).toBe(200);
		const manifest = (await response.json()) as Record<string, unknown>;
		expect(Object.keys(manifest)).toContain('routes/slow');
	});

	test('HEAD carries the headers of the GET, and no body', async () => {
		const response = await served().request('/', {
			method: 'HEAD',
			headers: browser,
		});
		expect(response.status).toBe(200);
		expect(response.headers.get('content-type')).toBe('text/html');
		expect(await response.text()).toBe('');
	});
});

describe('beside the app', () => {
	test('a route declared before the catch-all answers first', async () => {
		const response = await served().request('/api/health');
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ok: true });
	});

	test('a route declared after the catch-all answers too, through fetch and listen alike', async () => {
		const app = served().get('/api/after/:id', ({ params, reply }) =>
			reply.ok({ after: params.id }),
		);
		const fetched = await app.request('/api/after/7');
		expect(fetched.status).toBe(200);
		expect(await fetched.json()).toEqual({ after: '7' });
		const server = app.listen({ port: 0 });
		try {
			const listened = await fetch(new URL('/api/after/7', server.url));
			expect(listened.status).toBe(200);
			expect(await listened.json()).toEqual({ after: '7' });
		} finally {
			server.stop(true);
		}
		// The path is chosen before the method: a POST there is the route's
		// 405, not a page.
		expect((await app.request('/api/after/7', { method: 'POST' })).status).toBe(
			405,
		);
	});

	test('the hashed assets are immutable; a missing one is a 404, not a page', async () => {
		const app = served();
		const html = await (await app.request('/', { headers: browser })).text();
		const asset = html.match(/\/assets\/entry\.client-[\w-]+\.js/)?.[0];
		expect(asset).toBeDefined();
		const response = await app.request(asset as string);
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe(
			'public, max-age=31536000, immutable',
		);
		const missing = await app.request('/assets/nope.js');
		expect(missing.status).toBe(404);
		expect(await missing.json()).toEqual({ error: 'not_found' });
	});

	test("public/'s files are served with an hour's cache", async () => {
		const response = await served().request('/robots.txt');
		expect(response.status).toBe(200);
		expect(response.headers.get('cache-control')).toBe('public, max-age=3600');
		expect(await response.text()).toContain('User-agent');
	});

	test('in development the client build is left to Vite', () => {
		const app = makeBase().plugin((app) =>
			reactRouter(app, { build, client: CLIENT, mode: 'development' }),
		);
		expect(app.routes.map((route) => route.path)).not.toContain('/assets/*');
	});

	test('a client folder that is not one is refused at startup', () => {
		expect(() =>
			alxia().plugin((app) =>
				reactRouter(app, { build, client: `${CLIENT}/nowhere` }),
			),
		).toThrow('is not a directory');
	});

	test('client may be a file: URL', () => {
		const app = alxia().plugin((app) =>
			reactRouter(app, { build, client: new URL(`file://${CLIENT}`) }),
		);
		expect(app.routes.map((route) => route.path)).toContain('/assets/*');
	});

	test('isReactRouterRoute names the catch-all and the client files, for matchesSpec to leave out', () => {
		const app = served();
		const ours = app.routes
			.filter(isReactRouterRoute)
			.map((route) => `${route.method} ${route.path}`);
		expect(ours).toEqual([
			'GET /assets/*',
			'GET /robots.txt',
			'GET /*',
			'POST /*',
			'PUT /*',
			'PATCH /*',
			'DELETE /*',
		]);
		const health = { method: 'GET', path: '/api/health' } as const;
		expect(() =>
			matchesSpec(app, [health], { exclude: isReactRouterRoute }),
		).not.toThrow();
		expect(() => matchesSpec(app, [health])).toThrow(
			'7 routes have no operation',
		);
	});
});

describe('the build', () => {
	test('a function is called on every request in development', async () => {
		let calls = 0;
		const app = alxia().plugin((app) =>
			reactRouter(app, {
				mode: 'development',
				build: () => {
					calls += 1;
					return build;
				},
			}),
		);
		await app.request('/', { headers: browser });
		await app.request('/', { headers: browser });
		expect(calls).toBe(2);
	});

	test('and once in production', async () => {
		let calls = 0;
		const app = alxia().plugin((app) =>
			reactRouter(app, {
				build: async () => {
					calls += 1;
					return build;
				},
			}),
		);
		await Promise.all([
			app.request('/', { headers: browser }),
			app.request('/', { headers: browser }),
		]);
		await app.request('/', { headers: browser });
		expect(calls).toBe(1);
	});

	test('a function that failed is tried again on the next request', async () => {
		let calls = 0;
		const app = alxia().plugin((app) =>
			reactRouter(app, {
				build: async () => {
					calls += 1;
					if (calls === 1) throw new Error('not built yet');
					return build;
				},
			}),
		);
		expect((await app.request('/', { headers: browser })).status).toBe(500);
		expect((await app.request('/', { headers: browser })).status).toBe(200);
	});
});

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
			// @ts-expect-error: no hook derives `tenant`
			ctx.tenant;
			// @ts-expect-error: `user` is null without the header
			ctx.user.name;
			// @ts-expect-error: the type argument is an app
			alxiaOf<{ user: string }>(context);
			return { name, route };
		};
		expect(typed).toBeFunction();
	});

	test('getLoadContext reads only what the hooks before it built', () => {
		const typed = () => {
			const base = alxia().derive(() => ({ user: { id: '1' } }));
			base.plugin((app) =>
				reactRouter(app, { build, getLoadContext: ({ user }) => void user.id }),
			);
			base.plugin((app) =>
				reactRouter(app, {
					build,
					// @ts-expect-error: no hook before it derives `tenant`
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
				// @ts-expect-error: no hook before it derives `tenant`
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

describe('streaming', () => {
	/** The first chunk of `/slow`, and the whole page, read off a real server. */
	async function slow(
		app: { listen(options: { port: number }): Bun.Server<unknown> },
		encoding: string,
	) {
		const server = app.listen({ port: 0 });
		try {
			const started = performance.now();
			const response = await fetch(new URL('/slow', server.url), {
				headers: { 'user-agent': BROWSER, 'accept-encoding': encoding },
			});
			const reader = (response.body as ReadableStream<Uint8Array>).getReader();
			const decoder = new TextDecoder();
			let first: { at: number; text: string } | undefined;
			let all = '';
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				const chunk = decoder.decode(value, { stream: true });
				first ??= { at: performance.now() - started, text: chunk };
				all += chunk;
			}
			return {
				encoding: response.headers.get('content-encoding'),
				first,
				all,
				ended: performance.now() - started,
			};
		} finally {
			server.stop(true);
		}
	}

	/** The shell and its fallback first, the deferred value 600 ms later. */
	function expectStreamed({
		first,
		all,
		ended,
	}: Awaited<ReturnType<typeof slow>>) {
		expect(first?.text).toContain('immediate-value');
		expect(first?.text).toContain('id="fallback"');
		expect(first?.text).not.toContain('deferred-value');
		expect(all).toContain('deferred-value');
		expect(first?.at ?? Infinity).toBeLessThan(ended - 300);
	}

	test('the shell arrives before the deferred value', async () => {
		expectStreamed(await slow(served(), 'identity'));
	});

	test.each(['gzip', 'br', 'zstd'])(
		'and still does behind @alxia/compress, in %s',
		async (encoding) => {
			const app = makeBase()
				.plugin(compress())
				.plugin((app) => reactRouter(app, { build }));
			const result = await slow(app, encoding);
			expect(result.encoding).toBe(encoding);
			expectStreamed(result);
		},
	);
});
