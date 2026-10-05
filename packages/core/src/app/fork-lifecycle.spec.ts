/**
 * What a fork takes of its base beside the routes — the lifecycle hooks,
 * the parsers — and keeps apart from it: each app runs the base's hooks
 * once, and its own alone.
 */
import { describe, expect, test } from 'bun:test';
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
});
