import { beforeAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import type { BaseContext, ContextOf } from '@alxia/core';
// By its published name, as the fixture's build imports it: see react-router.spec.ts.
import {
	alxiaContext,
	alxiaOf,
	createServer,
	isReactRouterRoute,
	type RegisteredOf,
} from '@alxia/react-router';
import { RouterContextProvider, type ServerBuild } from 'react-router';
import { configure } from '../fixture/base';
import { BROWSER, CLIENT, FIXTURE, fixtureBuild } from '../test/fixture';

const SERVER_BUILD = join(FIXTURE, 'build', 'server', 'index.js');

let build: ServerBuild;
beforeAll(async () => {
	build = await fixtureBuild();
}, 60_000);

const browser = { 'user-agent': BROWSER };
const text = (html: string) => html.replaceAll('<!-- -->', '');

/** A guard: every route declared after it refuses a request without `x-pass`. */
const refused = ({ request, reply }: BaseContext) =>
	request.headers.has('x-pass') ? {} : reply(401, { error: 'refused' });

describe('createServer', () => {
	test('with no options, the pages are served behind a fresh app', async () => {
		const app = createServer().create({ build, client: CLIENT });
		const response = await app.request('/', {
			headers: { ...browser, 'x-user': 'Ada' },
		});
		expect(response.status).toBe(200);
		// No hook derives `user`.
		expect(text(await response.text())).toContain('<h1>Hello anonymous</h1>');
	});

	test("configure's hooks and routes run before the pages, its context read by the loaders", async () => {
		const app = createServer({ configure }).create({ build, client: CLIENT });
		const page = await app.request('/', {
			headers: { ...browser, 'x-user': 'Ada' },
		});
		expect(text(await page.text())).toContain('<h1>Hello Ada</h1>');
		const health = await app.request('/api/health');
		expect(await health.json()).toEqual({ ok: true });
	});

	test("the client's files come before configure's hooks, and after beforeAll's", async () => {
		const asset = (app: { request(path: string): Promise<Response> }) =>
			app.request('/robots.txt');
		const configured = createServer({
			configure: (app) => app.derive(refused),
		}).create({ build, client: CLIENT });
		expect((await asset(configured)).status).toBe(200);
		expect((await configured.request('/', { headers: browser })).status).toBe(
			401,
		);
		const first = createServer({
			beforeAll: (app) => app.derive(refused),
		}).create({ build, client: CLIENT });
		expect((await asset(first)).status).toBe(401);
	});

	test('beforeAll and configure chain their types and their apps', async () => {
		const app = createServer({
			beforeAll: (app) => app.decorate({ region: 'eu' }),
			configure: (app) =>
				app.get('/api/region', ({ region, reply }) => reply.ok({ region })),
		}).create({ build });
		expect(await (await app.request('/api/region')).json()).toEqual({
			region: 'eu',
		});
	});

	test('getLoadContext gets the context configure built, alxiaContext already set', async () => {
		const seen: unknown[] = [];
		const app = createServer({
			configure,
			getLoadContext: (ctx, context) => {
				seen.push(ctx.user?.name, context.get(alxiaContext) === ctx);
			},
		}).create({ build });
		await app.request('/', { headers: { ...browser, 'x-user': 'Di' } });
		expect(seen).toEqual(['Di', true]);
	});

	test('client: false serves none of the client build', () => {
		const app = createServer({ client: false }).create({
			build,
			client: CLIENT,
		});
		const paths = app.routes.map((route) => route.path);
		expect(paths).not.toContain('/assets/*');
		expect(paths).toContain('/*');
	});

	test('in development the client build is left to Vite', () => {
		const app = createServer().create({
			build,
			client: CLIENT,
			mode: 'development',
		});
		expect(app.routes.map((route) => route.path)).not.toContain('/assets/*');
	});

	test("the options override the plugin's wiring", async () => {
		let calls = 0;
		const app = createServer({
			mode: 'development',
			client: CLIENT,
			build: () => {
				calls += 1;
				return build;
			},
		}).create({
			build: () => {
				throw new Error('not this one');
			},
			mode: 'production',
		});
		await app.request('/', { headers: browser });
		await app.request('/', { headers: browser });
		// Development: the option's function on every request, and no client.
		expect(calls).toBe(2);
		expect(app.routes.map((route) => route.path)).not.toContain('/assets/*');
	});

	test('isReactRouterRoute names the client files createServer declared, not configure’s routes', () => {
		const app = createServer({ configure }).create({ build, client: CLIENT });
		expect(
			app.routes
				.filter(isReactRouterRoute)
				.map((route) => `${route.method} ${route.path}`),
		).toEqual([
			'GET /assets/*',
			'GET /robots.txt',
			'GET /*',
			'POST /*',
			'PUT /*',
			'PATCH /*',
			'DELETE /*',
		]);
	});

	test('each create is a new app', () => {
		const server = createServer({ configure });
		expect(server.create({ build })).not.toBe(server.create({ build }));
	});
});

describe('the types', () => {
	test('configure, beforeAll and getLoadContext are typed by the app they build', () => {
		const typed = () => {
			createServer({
				configure,
				getLoadContext: ({ user }) => void user?.name,
			});
			createServer({
				configure,
				// @ts-expect-error: no hook of configure derives `tenant`
				getLoadContext: ({ tenant }) => void tenant,
			});
			createServer({
				// @ts-expect-error: configure returns the app
				configure: (app) => void app,
			});
			createServer({
				// @ts-expect-error: beforeAll returns the app
				beforeAll: (app) => void app,
			});
			createServer({
				beforeAll: (app) => app.decorate({ region: 'eu' }),
				configure: (app) => app.derive(({ region }) => ({ upper: region })),
				getLoadContext: ({ region, upper }) => void `${region}${upper}`,
			});
			createServer({
				// @ts-expect-error: nothing before configure decorates `region`
				configure: (app) => app.derive(({ region }) => ({ region })),
			});
			// @ts-expect-error: client is a path, a URL or false
			createServer({ client: true });
		};
		expect(typed).toBeFunction();
	});

	test('alxiaOf reads a server, an app, or BaseContext with neither', () => {
		const server = createServer({ configure });
		const typed = (context: RouterContextProvider) => {
			const name: string | undefined =
				alxiaOf<typeof server>(context).user?.name;
			// @ts-expect-error: no hook of the server derives `tenant`
			alxiaOf<typeof server>(context).tenant;
			// Unregistered in this program: BaseContext.
			const base: BaseContext = alxiaOf(context);
			// @ts-expect-error: BaseContext has no `user`
			alxiaOf(context).user;
			// @ts-expect-error: the type argument is a server or an app
			alxiaOf<{ create(): void }>(context);
			return { name, base };
		};
		expect(typed).toBeFunction();
	});

	test('Register names a server or an app; anything else makes every read an error', () => {
		const server = createServer({ configure });
		const typed = () => {
			const registered = {} as ContextOf<
				RegisteredOf<{ server: typeof server }>
			>;
			const name: string | undefined = registered.user?.name;
			const unregistered: BaseContext = {} as ContextOf<RegisteredOf<object>>;
			// The module rather than its default export: refused, not `never`.
			const wrong = {} as ContextOf<
				RegisteredOf<{ server: { default: typeof server } }>
			>;
			// @ts-expect-error: a wrong registration types no `user`
			wrong.user;
			// @ts-expect-error: nor anything assignable to what reads it
			const tenant: { a: number } = wrong.tenant;
			return { name, unregistered, tenant };
		};
		expect(typed).toBeFunction();
	});

	test('alxiaOf outside the catch-all says how to serve the app', () => {
		expect(() => alxiaOf(new RouterContextProvider())).toThrow(
			'add alxia() from @alxia/react-router/vite',
		);
	});
});

describe('start', () => {
	test("listen's port and hostname win over PORT and HOST, and onListen is told", async () => {
		const { child, out } = await run(
			[
				'const server = createServer({',
				"\tlisten: { port: 0, hostname: '127.0.0.1' },",
				'\tonListen: (listening) => console.log(`told ${listening.url}`),',
				'});',
				'server.start(server.create({ build }));',
			],
			'told ',
			{ PORT: '1', HOST: '0.0.0.0' },
		);
		try {
			const url = out.match(/told (\S+)/)?.[1] as string;
			expect(url).toStartWith('http://127.0.0.1:');
			expect(url).not.toBe('http://127.0.0.1:1/');
			expect((await fetch(new URL('/nowhere', url))).status).toBe(404);
			child.kill('SIGTERM');
			expect(await child.exited).toBe(0);
		} finally {
			child.kill();
		}
	});

	test('a signal sent from onListen runs the onStop hooks: the handlers are in place first', async () => {
		const { child, out } = await run(
			[
				'const server = createServer({',
				"\tconfigure: (app) => app.onStop(() => console.log('onStop ran')),",
				"\tlisten: { port: 0, hostname: '127.0.0.1' },",
				"\tonListen: () => process.kill(process.pid, 'SIGTERM'),",
				'});',
				'server.start(server.create({ build }));',
			],
			'onStop ran',
		);
		try {
			expect(out).toContain('onStop ran');
			expect(await child.exited).toBe(0);
		} finally {
			child.kill();
		}
	});

	test('an onStop hook that throws on SIGTERM ends the process with 1, printing the error', async () => {
		const { child } = await run(
			[
				'const server = createServer({',
				"\tconfigure: (app) => app.onStop(() => { throw new Error('pool would not close'); }),",
				"\tlisten: { port: 0, hostname: '127.0.0.1' },",
				'});',
				'server.start(server.create({ build }));',
			],
			'alxia listening on',
		);
		try {
			child.kill('SIGTERM');
			expect(await child.exited).toBe(1);
			expect(await new Response(child.stderr).text()).toContain(
				'pool would not close',
			);
		} finally {
			child.kill();
		}
	});
});

/**
 * A process that imports the package and the fixture's build, then runs
 * `lines`: `start` installs signal handlers, kept out of the test's own
 * process. Resolves once its output holds `ready`.
 */
async function run(
	lines: readonly string[],
	ready: string,
	env: Record<string, string> = {},
) {
	const script = [
		"import { createServer } from '@alxia/react-router';",
		`const build = await import(${JSON.stringify(SERVER_BUILD)});`,
		...lines,
	].join('\n');
	const child = Bun.spawn([process.execPath, '-e', script], {
		cwd: join(import.meta.dir, '..'),
		env: { ...process.env, ...env },
		stdout: 'pipe',
		stderr: 'pipe',
	});
	const reader = child.stdout.getReader();
	let out = '';
	while (!out.includes(ready)) {
		const { done, value } = await reader.read();
		if (done) {
			child.kill();
			throw new Error(`exited: ${out}`);
		}
		out += new TextDecoder().decode(value);
	}
	reader.releaseLock();
	return { child, out };
}
