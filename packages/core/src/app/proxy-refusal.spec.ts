import { describe, expect, mock, spyOn, test } from 'bun:test';
import { type ProxyRefusalAnswer, trustProxy } from '../request/trust-proxy';
import { alxia } from './alxia';

const from = (peer: string) =>
	({ requestIP: () => ({ address: peer }) }) as unknown as Bun.Server<unknown>;

const CLIENT = from('198.51.100.4');
const PROXY = from('10.0.0.1');

function app(
	untrusted: 'refuse' | 'refuse-all',
	refusal?: ProxyRefusalAnswer,
	problem = false,
) {
	const options = {
		trusted: ['10.0.0.0/8'],
		untrusted,
		...(refusal === undefined ? {} : { refusal }),
	} as Parameters<typeof trustProxy>[0];
	return alxia({
		proxy: trustProxy(options),
		...(problem ? { errors: 'problem' as const } : {}),
	});
}

const get = (
	served: ReturnType<typeof app>,
	server: Bun.Server<unknown>,
	headers: Record<string, string> = {},
) =>
	served.fetch(
		new Request('http://app.internal:3000/secret?token=abc', { headers }),
		server,
	);

describe('trustProxy({ refusal })', () => {
	test('the default body is unchanged', async () => {
		for (const untrusted of ['refuse', 'refuse-all'] as const) {
			const response = await get(app(untrusted), CLIENT, {
				'x-forwarded-for': '203.0.113.9',
			});
			expect(response.status).toBe(403);
			expect(await response.json()).toEqual({ error: 'untrusted_proxy' });
		}
	});

	test('nothing of the request is in the default body', async () => {
		const response = await get(app('refuse', undefined, true), CLIENT, {
			'x-forwarded-for': '203.0.113.9',
			cookie: 'session=hunter2',
		});
		const text = await response.text();
		for (const secret of ['203.0.113.9', 'hunter2', 'abc', '198.51.100.4'])
			expect(text).not.toContain(secret);
	});

	test('a custom body answers both modes, told why and from where', async () => {
		const seen: unknown[] = [];
		const refusal: ProxyRefusalAnswer = ({ ip, refusal, url }) => {
			seen.push({ ip, refusal, path: url.pathname });
			return new Response('forbidden', { status: 403 });
		};
		const headers = { 'x-forwarded-for': '203.0.113.9' };
		const first = await get(app('refuse', refusal), CLIENT, headers);
		expect(first.status).toBe(403);
		expect(await first.text()).toBe('forbidden');
		const second = await get(app('refuse-all', refusal), CLIENT);
		expect(await second.text()).toBe('forbidden');
		expect(seen).toEqual([
			{ ip: '198.51.100.4', refusal: 'headers', path: '/secret' },
			{ ip: '198.51.100.4', refusal: 'peer', path: '/secret' },
		]);
	});

	test('an async answer works, and a trusted proxy never reaches it', async () => {
		const refusal = mock(async () => new Response('no', { status: 403 }));
		const served = app('refuse', refusal);
		expect(
			await (await get(served, CLIENT, { forwarded: 'for=1.2.3.4' })).text(),
		).toBe('no');
		await get(served, PROXY, { 'x-forwarded-for': '203.0.113.9' });
		expect(refusal).toHaveBeenCalledTimes(1);
	});

	test('a function that throws, or answers no 403, ends in the 500', async () => {
		const log = spyOn(console, 'error').mockImplementation(() => {});
		const headers = { 'x-forwarded-for': '203.0.113.9' };
		const throws = app('refuse', () => {
			throw new Error('boom');
		});
		const wrong = app('refuse', () => new Response('ok', { status: 200 }));
		for (const served of [throws, wrong]) {
			const response = await get(served, CLIENT, headers);
			expect(response.status).toBe(500);
			expect(await response.json()).toEqual({ error: 'internal' });
		}
		log.mockRestore();
	});

	test('a refusal that is no function is refused at declaration', () => {
		expect(() =>
			trustProxy({
				trusted: ['10.0.0.0/8'],
				untrusted: 'refuse',
				refusal: 'forbidden' as never,
			}),
		).toThrow('refusal must be a function');
	});

	test("refusal under untrusted: 'ignore' would never run: refused at declaration", () => {
		expect(() =>
			trustProxy({ trusted: ['10.0.0.0/8'], refusal: () => new Response() }),
		).toThrow("refusal is for untrusted: 'refuse' or 'refuse-all'");
	});
});
