import { describe, expect, test } from 'bun:test';
import { health } from '../health/health';
import { type ProxyAllow, trustProxy } from '../request/trust-proxy';
import { alxia } from './alxia';

/** A server whose every connection comes from `peer`. */
const from = (peer: string) =>
	({ requestIP: () => ({ address: peer }) }) as unknown as Bun.Server<unknown>;

const PROXY = from('10.0.0.1');
const CLIENT = from('198.51.100.4');
const LOOPBACK = from('::ffff:127.0.0.1');

/** An app only the proxies in 10.0.0.0/8 may reach, but for what `allow` lets through. */
function app(allow?: ProxyAllow, problem = false) {
	return alxia({
		proxy: trustProxy({
			trusted: ['10.0.0.0/8'],
			untrusted: 'refuse-all',
			...(allow === undefined ? {} : { allow }),
		}),
		...(problem ? { errors: 'problem' as const } : {}),
	})
		.plugin(health())
		.get('/where', (ctx) => ctx.reply(200, { ip: ctx.ip ?? null }));
}

const get = (
	served: ReturnType<typeof app>,
	path: string,
	server?: Bun.Server<unknown>,
	headers: Record<string, string> = {},
) =>
	served.fetch(
		new Request(`http://app.internal:3000${path}`, { headers }),
		server,
	);

describe("untrusted: 'refuse-all'", () => {
	test('a request from no proxy is refused, with no forwarding header', async () => {
		const response = await get(app(), '/where', CLIENT);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: 'untrusted_proxy' });
	});

	test('so is one from a connection of unknown address', async () => {
		expect((await get(app(), '/where')).status).toBe(403);
	});

	test('the proxy passes, its client read', async () => {
		const response = await get(app(), '/where', PROXY, {
			'x-forwarded-for': '203.0.113.9',
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ip: '203.0.113.9' });
	});

	test("the 403 is a problem under errors: 'problem', naming the connection", async () => {
		const response = await get(app(undefined, true), '/where', CLIENT);
		expect(response.status).toBe(403);
		expect(response.headers.get('content-type')).toBe(
			'application/problem+json',
		);
		expect(await response.json()).toMatchObject({
			status: 403,
			detail: 'A connection that is no trusted proxy',
			instance: '/where',
		});
	});

	test('a health probe from no proxy is refused too, unless allowed', async () => {
		expect((await get(app(), '/health', CLIENT)).status).toBe(403);
	});
});

describe('allow', () => {
	test('peers by range pass, their headers unread, their ip their own', async () => {
		const allowed = app(['127.0.0.1', '192.168.0.0/16']);
		const response = await get(allowed, '/where', LOOPBACK, {
			'x-forwarded-for': '6.6.6.6',
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ ip: '127.0.0.1' });
		expect((await get(allowed, '/where', CLIENT)).status).toBe(403);
	});

	test('a path predicate lets the probes through, and nothing else', async () => {
		const probes = app((request) =>
			['/health', '/ready'].includes(new URL(request.url).pathname),
		);
		expect((await get(probes, '/health', CLIENT)).status).toBe(200);
		expect((await get(probes, '/ready', CLIENT)).status).toBe(200);
		expect((await get(probes, '/where', CLIENT)).status).toBe(403);
		expect((await get(probes, '/health/x', CLIENT)).status).toBe(403);
	});

	test('the predicate is given the peer as ctx.ip shows it', async () => {
		const peers: (string | undefined)[] = [];
		const seen = app((_, peer) => {
			peers.push(peer);
			return false;
		});
		await get(seen, '/where', LOOPBACK);
		await get(seen, '/where');
		expect(peers).toEqual(['127.0.0.1', undefined]);
	});

	test('only true lets a request through', async () => {
		const truthy = app((() => 1) as unknown as ProxyAllow);
		expect((await get(truthy, '/where', CLIENT)).status).toBe(403);
	});
});

describe('what refuse-all cannot gate', () => {
	test('an allow that throws lets nothing through', async () => {
		const throwing = app(() => {
			throw new Error('bad predicate');
		});
		expect((await get(throwing, '/where', CLIENT)).status).toBe(403);
	});

	test('listen refuses page() routes, which Bun serves past the refusal', async () => {
		const bundle = (await import('../../test/fixtures/page.html')).default;
		const paged = app().page('/dash', bundle);
		expect(() => paged.listen({ port: 0, signals: false })).toThrow(
			"listen(): trustProxy's untrusted: 'refuse-all' cannot refuse the page() routes",
		);
		const refusing = alxia({
			proxy: trustProxy({ trusted: ['10.0.0.0/8'], untrusted: 'refuse' }),
		}).page('/dash', bundle);
		refusing.listen({ port: 0, signals: false });
		expect(refusing.server).toBeDefined();
		await refusing.stop();
	});
});
