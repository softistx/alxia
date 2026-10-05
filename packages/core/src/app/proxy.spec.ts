import { describe, expect, test } from 'bun:test';
import { health } from '../health/health';
import { forwardedIp } from '../request/forwarded-ip';
import { trustProxy } from '../request/trust-proxy';
import { alxia } from './alxia';
import { originalUrl } from './original-url';

/** A server whose every connection comes from `peer`. */
const from = (peer: string) =>
	({ requestIP: () => ({ address: peer }) }) as unknown as Bun.Server<unknown>;

const PROXY = from('10.0.0.1');
const CLIENT = from('198.51.100.4');

const behindProxy = {
	'x-forwarded-for': '203.0.113.9',
	'x-forwarded-proto': 'https',
	'x-forwarded-host': 'example.com',
};

function app(untrusted: 'ignore' | 'refuse' = 'ignore', problem = false) {
	return alxia({
		proxy: trustProxy({ trusted: ['10.0.0.0/8'], untrusted }),
		...(problem ? { errors: 'problem' as const } : {}),
	})
		.plugin(health())
		.get('/where', (ctx) =>
			ctx.reply(200, { ip: ctx.ip ?? null, url: originalUrl(ctx).href }),
		);
}

const get = (
	served: { fetch: (r: Request, s?: Bun.Server<unknown>) => Promise<Response> },
	path: string,
	headers: Record<string, string>,
	server: Bun.Server<unknown>,
) =>
	served.fetch(
		new Request(`http://app.internal:3000${path}`, { headers }),
		server,
	);

describe('alxia({ proxy })', () => {
	test('ctx.ip and originalUrl(ctx) are what the trusted proxy said', async () => {
		const response = await get(app(), '/where?x=1', behindProxy, PROXY);
		expect(await response.json()).toEqual({
			ip: '203.0.113.9',
			url: 'https://example.com/where?x=1',
		});
	});

	test('a direct client spoofing https and a host gets its own URL', async () => {
		const response = await get(app(), '/where', behindProxy, CLIENT);
		expect(await response.json()).toEqual({
			ip: '198.51.100.4',
			url: 'http://app.internal:3000/where',
		});
	});

	test('an invalid host keeps the request URL, a valid scheme still applies', async () => {
		const response = await get(
			app(),
			'/where',
			{ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'evil.example/x' },
			PROXY,
		);
		expect((await response.json()).url).toBe('https://app.internal:3000/where');
	});

	test("untrusted: 'refuse' answers 403 before any route", async () => {
		const response = await get(app('refuse'), '/where', behindProxy, CLIENT);
		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({ error: 'untrusted_proxy' });
	});

	test("the 403 is a problem under errors: 'problem'", async () => {
		const response = await get(
			app('refuse', true),
			'/where',
			{ 'x-forwarded-proto': 'https' },
			CLIENT,
		);
		expect(response.status).toBe(403);
		expect(response.headers.get('content-type')).toBe(
			'application/problem+json',
		);
		expect(await response.json()).toMatchObject({
			status: 403,
			instance: '/where',
		});
	});

	test('a health probe that sends no forwarding header is answered', async () => {
		for (const path of ['/health', '/ready']) {
			const response = await get(app('refuse'), path, {}, CLIENT);
			expect(response.status).toBe(200);
		}
	});

	test('the trusted proxy is never refused', async () => {
		const response = await get(app('refuse'), '/where', behindProxy, PROXY);
		expect(response.status).toBe(200);
	});

	test('ip and proxy together are refused', () => {
		expect(() =>
			alxia({
				ip: forwardedIp({ trusted: 1 }),
				proxy: trustProxy({ trusted: 1 }),
			}),
		).toThrow('give ip or proxy, not both');
		expect(() => alxia({ proxy: {} as never })).toThrow('trustProxy');
	});
});

describe('originalUrl', () => {
	test('without the option, a copy of ctx.url', async () => {
		let same: boolean | undefined;
		const plain = alxia().get('/where', (ctx) => {
			const url = originalUrl(ctx);
			same = url !== ctx.url && url.href === ctx.url.href;
			return ctx.reply(200, url.href);
		});
		const response = await get(plain, '/where', behindProxy, PROXY);
		expect(await response.text()).toBe('http://app.internal:3000/where');
		expect(same).toBeTrue();
	});

	test("a forwarded host's own port, or the scheme's default", async () => {
		const served = alxia({ proxy: trustProxy({ trusted: 1 }) }).get(
			'/',
			(ctx) => ctx.reply(200, originalUrl(ctx).href),
		);
		const href = async (headers: Record<string, string>) =>
			(await get(served, '/', headers, PROXY)).text();
		expect(
			await href({
				'x-forwarded-proto': 'https',
				'x-forwarded-host': 'a.example:443',
			}),
		).toBe('https://a.example/');
		expect(await href({ 'x-forwarded-host': '[2001:db8::1]:8080' })).toBe(
			'http://[2001:db8::1]:8080/',
		);
		expect(await href({ 'x-forwarded-proto': 'https' })).toBe(
			'https://app.internal:3000/',
		);
	});
});
