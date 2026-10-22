import { describe, expect, test } from 'bun:test';
import { alxia, trustProxy } from '@alxia/core';
import { rateLimit } from './rate-limit';
import { MemoryStore } from './store';

/** A server whose every connection comes from `peer`. */
const from = (peer: string) =>
	({ requestIP: () => ({ address: peer }) }) as unknown as Bun.Server<unknown>;

/** A store that remembers the keys it was asked to count. */
function recording() {
	const keys: string[] = [];
	const inner = new MemoryStore();
	return {
		keys,
		store: {
			consume: (key: string, policy: { limit: number; windowMs: number }) => {
				keys.push(key);
				return inner.consume(key, policy);
			},
			reset: (key: string) => inner.reset(key),
		},
	};
}

/** The keys counted for requests coming from each of `peers`, in order. */
async function keysOf(peers: string[], ipv6Prefix?: number) {
	const { keys, store } = recording();
	const app = alxia()
		.use(
			rateLimit({
				limit: 100,
				windowMs: 60_000,
				store,
				...(ipv6Prefix === undefined ? {} : { ipv6Prefix }),
			}),
		)
		.get('/', ({ reply }) => reply(200, 'ok'));
	for (const peer of peers) {
		await app.fetch(new Request('http://localhost/'), from(peer));
	}
	return keys;
}

describe('ipv6Prefix', () => {
	test('without it, every key is the address, as before', async () => {
		const peers = [
			'2001:db8:1:2::1',
			'2001:db8:1:2::2',
			'203.0.113.9',
			'::ffff:203.0.113.9',
			'::1',
		];
		expect(await keysOf(peers)).toEqual([
			'2001:db8:1:2::1',
			'2001:db8:1:2::2',
			'203.0.113.9',
			'203.0.113.9',
			'::1',
		]);
	});

	test('64 puts the addresses of one /64 in one key, and keeps another apart', async () => {
		const keys = await keysOf(
			[
				'2001:db8:1:2::1',
				'2001:db8:1:2:aaaa:bbbb:cccc:dddd',
				'2001:db8:1:3::1',
			],
			64,
		);
		expect(keys).toEqual([
			'2001:db8:1:2::/64',
			'2001:db8:1:2::/64',
			'2001:db8:1:3::/64',
		]);
	});

	test('IPv4, IPv4-mapped and loopback', async () => {
		expect(
			await keysOf(['203.0.113.9', '::ffff:203.0.113.9', '::1'], 64),
		).toEqual(['203.0.113.9', '203.0.113.9', '::/64']);
	});

	test('0, 48 and 128', async () => {
		const peer = ['2001:db8:1:2::1'];
		expect(await keysOf(peer, 0)).toEqual(['::/0']);
		expect(await keysOf(peer, 48)).toEqual(['2001:db8:1::/48']);
		expect(await keysOf(peer, 128)).toEqual(['2001:db8:1:2::1/128']);
	});

	test('two requests from two addresses of a /64 share the allowance', async () => {
		const app = alxia({ proxy: trustProxy({ trusted: ['10.0.0.0/8'] }) })
			.use(rateLimit({ limit: 2, windowMs: 60_000, ipv6Prefix: 64 }))
			.get('/', ({ reply }) => reply(200, 'ok'));
		const statuses: number[] = [];
		for (const client of [
			'2001:db8:1:2::1',
			'2001:db8:1:2::2',
			'2001:db8:1:2::3',
			'2001:db8:1:9::1',
		]) {
			const request = new Request('http://localhost/', {
				headers: { 'x-forwarded-for': client },
			});
			statuses.push((await app.fetch(request, from('10.0.0.1'))).status);
		}
		expect(statuses).toEqual([200, 200, 429, 200]);
	});

	test('a value that is not a whole number from 0 to 128 throws', () => {
		for (const bad of [-1, 129, 64.5, Number.NaN, Number.POSITIVE_INFINITY]) {
			expect(() =>
				rateLimit({ limit: 1, windowMs: 1, ipv6Prefix: bad }),
			).toThrow(
				`rateLimit: ipv6Prefix must be a whole number from 0 to 128, not ${bad}`,
			);
		}
		for (const good of [0, 1, 64, 128]) {
			expect(() =>
				rateLimit({ limit: 1, windowMs: 1, ipv6Prefix: good }),
			).not.toThrow();
		}
	});

	test('with a key of your own it throws: the option would do nothing', () => {
		expect(() =>
			rateLimit({ limit: 1, windowMs: 1, ipv6Prefix: 64, key: () => 'one' }),
		).toThrow('rateLimit: ipv6Prefix applies to the default key');
	});
});
