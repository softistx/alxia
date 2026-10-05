/**
 * What a fork takes of its base beside the routes — the lifecycle hooks,
 * the parsers — and keeps apart from it: each app runs the base's hooks
 * once, and its own alone.
 */
import { describe, expect, spyOn, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import { validate } from './validate';

describe('fork(): lifecycle hooks and parsers', () => {
	test("each app runs the base's onStart and onStop once, and its own alone", async () => {
		const ran: string[] = [];
		const shared = alxia()
			.onStart(() => {
				ran.push('base start');
			})
			.onStop(() => {
				ran.push('base stop');
			});
		const a = shared.fork().onStop(() => {
			ran.push('a stop');
		});
		const b = shared.fork();
		a.listen({ port: 0, signals: false });
		await a.stop();
		expect(ran).toEqual(['base start', 'base stop', 'a stop']);
		ran.length = 0;
		b.listen({ port: 0, signals: false });
		await b.stop();
		expect(ran).toEqual(['base start', 'base stop']);
	});

	test('stopping one app leaves the other serving', async () => {
		const shared = alxia().get('/', ({ reply }) => reply(200, 'ok'));
		const a = shared.fork();
		const b = shared.fork();
		a.listen({ port: 0, signals: false });
		const server = b.listen({ port: 0, signals: false });
		await a.stop();
		expect(await (await fetch(server.url)).text()).toBe('ok');
		await b.stop();
	});

	test("a parser added to one is not the other's", async () => {
		const shared = alxia();
		const read = (app: typeof shared) =>
			app.post('/', validate({ body: z.string() }), ({ body, reply }) =>
				reply(200, body),
			);
		const a = read(
			shared
				.fork()
				.parser('text/x-upper', async (request) =>
					(await request.text()).toUpperCase(),
				),
		);
		const b = read(shared.fork());
		const send = {
			method: 'POST',
			body: 'hi',
			headers: { 'content-type': 'text/x-upper' },
		};
		expect(await (await a.request('/', send)).text()).toBe('HI');
		expect(await (await b.request('/', send)).text()).toBe('hi');
	});

	test('a group or a plugin function on a fork declares on the fork', async () => {
		const shared = alxia().derive(() => ({ user: 'ada' }));
		const a = shared
			.fork()
			.group('/g', (g) => g.get('/', ({ user, reply }) => reply(200, user)))
			.plugin((app) => app.get('/p', ({ reply }) => reply(200, 'p')));
		expect(await (await a.request('/g')).text()).toBe('ada');
		expect(await (await a.request('/p')).text()).toBe('p');
		expect(shared.routes).toEqual([]);
	});

	test("a fork keeps the base's socket routes, and one added to it stays its own", () => {
		const shared = alxia().ws('/chat', { message: () => {} });
		const a = shared.fork().ws('/news', { message: () => {} });
		expect(a.sockets.map((socket) => socket.path)).toEqual(['/chat', '/news']);
		expect(shared.sockets.map((socket) => socket.path)).toEqual(['/chat']);
	});

	test("a fork keeps the base's pages, and refuses a route at one", async () => {
		const bundle = (await import('../../test/fixtures/page.html')).default;
		const forked = alxia().page('/dash', bundle).fork();
		expect(() => forked.get('/dash', ({ reply }) => reply(200, 'x'))).toThrow(
			'GET /dash is already served by a page',
		);
	});

	test("a fork warns of its own late use() once, not of its base's again", () => {
		const warn = spyOn(console, 'warn').mockImplementation(() => {});
		try {
			const late = (_ctx: object, next: () => Promise<Response>) => next();
			const shared = alxia({ dev: true })
				.get('/a', ({ reply }) => reply(200, 'a'))
				.use(late);
			expect(warn).toHaveBeenCalledTimes(1);
			const forked = shared.fork();
			expect(warn).toHaveBeenCalledTimes(1);
			forked.use(late).use(late);
			expect(warn).toHaveBeenCalledTimes(2);
		} finally {
			warn.mockRestore();
		}
	});

	test("a group's app is not forked: its hooks would be lost", () => {
		expect(() => alxia().group('/g', (g) => g.fork())).toThrow(
			"fork(): a group's app shares the app's lifecycle hooks and chain; fork the app the group is declared on",
		);
	});
});
