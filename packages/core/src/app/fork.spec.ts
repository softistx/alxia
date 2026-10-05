/**
 * `fork()`: one base builds several apps — the real one, a spec's, a
 * variant — each on a fork of it, and what one declares stays its own.
 * Without it, every app built on the base declares on the base itself.
 */
import { describe, expect, test } from 'bun:test';
import { z } from 'zod';
import { alxia } from './alxia';
import { defineRoutes } from './define-plugin';
import { validate } from './validate';

const base = () =>
	alxia()
		.decorate({ db: 'db' })
		.get('/ping', ({ db, reply }) => reply(200, db));

const text = async (response: Promise<Response>) => {
	const answered = await response;
	return `${answered.status} ${await answered.text()}`;
};

describe('fork()', () => {
	test('two apps from one base each answer their routes, and only theirs', async () => {
		const shared = base();
		const a = shared.fork().get('/a', ({ reply }) => reply(200, 'a'));
		const b = shared.fork().get('/b', ({ reply }) => reply(200, 'b'));
		expect(await text(a.request('/a'))).toBe('200 a');
		expect(await text(b.request('/b'))).toBe('200 b');
		expect((await a.request('/b')).status).toBe(404);
		expect((await b.request('/a')).status).toBe(404);
		expect(await text(a.request('/ping'))).toBe('200 db');
		expect(await text(b.request('/ping'))).toBe('200 db');
		expect(shared.routes.map((route) => route.path)).toEqual(['/ping']);
		expect(a.routes.map((route) => route.path)).toEqual(['/ping', '/a']);
	});

	test('both may declare the same route', async () => {
		const shared = base();
		const a = shared.fork().get('/x', ({ reply }) => reply(200, 'a'));
		const b = shared.fork().get('/x', ({ reply }) => reply(200, 'b'));
		expect(await text(a.request('/x'))).toBe('200 a');
		expect(await text(b.request('/x'))).toBe('200 b');
	});

	test("a derive, a decorate or a use on one is not on the other's routes", async () => {
		const seen: string[] = [];
		const shared = base().use((_ctx, next) => {
			seen.push('base');
			return next();
		});
		const a = shared
			.fork()
			.decorate({ who: 'a' })
			.derive(() => ({ at: 1 }))
			.use((_ctx, next) => {
				seen.push('a');
				return next();
			})
			.get('/', ({ who, at, reply }) => reply(200, `${who}${at}`));
		const b = shared.fork().get('/', (ctx) => {
			// @ts-expect-error: `who` is a's alone
			void ctx.who;
			return ctx.reply(200, String('who' in ctx || 'at' in ctx));
		});
		expect(await text(a.request('/'))).toBe('200 a1');
		expect(await text(b.request('/'))).toBe('200 false');
		expect(seen).toEqual(['base', 'a', 'base']);
	});

	test('a plugin mounted on one is not on the other', async () => {
		const todos = defineRoutes('/todos')
			.use((_ctx, next) => next({ owner: 'ada' }))
			.get('/', ({ owner, reply }) => reply(200, owner));
		const shared = base();
		const a = shared.fork().plugin(todos);
		const b = shared.fork();
		expect(await text(a.request('/todos'))).toBe('200 ada');
		expect((await b.request('/todos')).status).toBe(404);
		expect(b.routes.map((route) => route.path)).toEqual(['/ping']);
	});

	test('the base declared on after a fork changes nothing of the fork', async () => {
		const shared = base();
		const forked = shared.fork();
		shared.get('/late', ({ reply }) => reply(200, 'late'));
		expect((await forked.request('/late')).status).toBe(404);
		expect(await text(shared.request('/late'))).toBe('200 late');
	});

	test('keeps the options, the prefix and the chain in force', async () => {
		const shared = alxia({ prefix: '/api', errors: 'problem' })
			.derive(() => ({ user: 'ada' }))
			.bodyLimit(4);
		const forked = shared
			.fork()
			.post('/echo', validate({ body: z.string() }), ({ user, body, reply }) =>
				reply(200, `${user} ${body}`),
			);
		const send = (body: string) =>
			forked.request('/api/echo', {
				method: 'POST',
				body,
				headers: { 'content-type': 'text/plain' },
			});
		expect(await text(send('hi'))).toBe('200 ada hi');
		const big = await send('0123456789');
		expect(big.status).toBe(413);
		expect(big.headers.get('content-type')).toContain('problem+json');
	});

	test('a fork of a fork is a fork too', async () => {
		const once = base().fork().decorate({ n: 1 });
		const twice = once
			.fork()
			.get('/n', ({ n, db, reply }) => reply(200, `${db}${n}`));
		expect(await text(twice.request('/n'))).toBe('200 db1');
		expect((await once.request('/n')).status).toBe(404);
	});
});

describe('one base built on twice, without fork()', () => {
	test('the same routes mounted again throw, saying to fork', () => {
		const todos = defineRoutes('/todos').get('/', ({ reply }) =>
			reply(200, 'x'),
		);
		const shared = base();
		shared.plugin(todos);
		expect(() => shared.plugin(todos)).toThrow(
			'GET /todos is declared twice, by the same route: mounted twice on one app, or by two apps built on one base; build each app on base.fork()',
		);
	});

	test('another route at the same method and path names fork() as one fix', () => {
		const shared = base().get('/x', ({ reply }) => reply(200, 'a'));
		expect(() => shared.get('/x', ({ reply }) => reply(200, 'b'))).toThrow(
			'GET /x is declared twice: keep one; if two apps are built on one base, build each on base.fork()',
		);
		const socket = { message: () => {} };
		const sockets = alxia().ws('/s', socket);
		expect(() => sockets.ws('/s', socket)).toThrow(
			'WS /s is declared twice, by the same route',
		);
	});
});
