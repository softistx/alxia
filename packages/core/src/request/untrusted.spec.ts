import { describe, expect, test } from 'bun:test';
import { forwardedIp } from './forwarded-ip';
import { trustProxy } from './trust-proxy';

const ranges = { trusted: ['10.0.0.0/8'] };

describe('the options', () => {
	test("'refuse' and 'refuse-all' need proxies named by address", () => {
		expect(() => trustProxy({ trusted: 1, untrusted: 'refuse' })).toThrow(
			"trustProxy: untrusted: 'refuse' needs the proxies named by address (CIDR ranges or a function), not a hop count",
		);
		expect(() =>
			trustProxy({ trusted: 1 as never, untrusted: 'refuse-all' }),
		).toThrow("untrusted: 'refuse-all' needs the proxies named by address");
	});

	test('what is none of the choices is refused, naming trustProxy', () => {
		expect(() =>
			trustProxy({ ...ranges, untrusted: 'drop' as 'ignore' }),
		).toThrow(
			"trustProxy: untrusted must be 'ignore', 'refuse' or 'refuse-all', not \"drop\"",
		);
		expect(() => trustProxy({ trusted: 0 })).toThrow(
			'trustProxy: trusted hops',
		);
		expect(() => trustProxy({ trusted: ['10.0.0.0/33'] })).toThrow(
			'trustProxy: "10.0.0.0/33"',
		);
	});

	test("allow is for 'refuse-all' alone", () => {
		for (const untrusted of ['ignore', 'refuse'] as const)
			expect(() =>
				trustProxy({ ...ranges, untrusted, allow: ['127.0.0.1'] as never }),
			).toThrow(
				`trustProxy: allow is for untrusted: 'refuse-all' alone; under '${untrusted}' a request with no forwarding header passes already`,
			);
	});

	test('allow is CIDR ranges or a function', () => {
		const strict = { ...ranges, untrusted: 'refuse-all' } as const;
		expect(() => trustProxy({ ...strict, allow: 5 as never })).toThrow(
			'trustProxy: allow must be CIDR ranges or a function (request, peer) => boolean',
		);
		expect(() => trustProxy({ ...strict, allow: [5] as never })).toThrow(
			'allow must be CIDR ranges',
		);
		expect(() => trustProxy({ ...strict, allow: ['10.0.0.0/33'] })).toThrow(
			'trustProxy: "10.0.0.0/33" is not an IP address or a CIDR range',
		);
	});

	test('canonical is a boolean', () => {
		expect(() => trustProxy({ ...ranges, canonical: 'yes' as never })).toThrow(
			'trustProxy: canonical must be true or false',
		);
		expect(() => forwardedIp({ ...ranges, canonical: 1 as never })).toThrow(
			'forwardedIp: canonical must be true or false',
		);
	});
});

describe('the types', () => {
	test("'refuse-all' takes proxies by address, and allow is its alone", () => {
		const refused = () => [
			// @ts-expect-error: a hop count cannot tell a proxy
			trustProxy({ trusted: 1, untrusted: 'refuse-all' }),
			// @ts-expect-error: allow is for untrusted: 'refuse-all'
			trustProxy({ ...ranges, untrusted: 'refuse', allow: ['127.0.0.1'] }),
			// @ts-expect-error: allow is for untrusted: 'refuse-all'
			trustProxy({ ...ranges, allow: ['127.0.0.1'] }),
			// @ts-expect-error: allow is CIDR ranges or a function
			trustProxy({ ...ranges, untrusted: 'refuse-all', allow: 5 }),
			// @ts-expect-error: the predicate answers a boolean
			trustProxy({ ...ranges, untrusted: 'refuse-all', allow: () => 'yes' }),
			// @ts-expect-error: canonical is a boolean
			trustProxy({ ...ranges, canonical: 'yes' }),
			// @ts-expect-error: canonical is a boolean
			forwardedIp({ ...ranges, canonical: 1 }),
		];
		expect(refused).toBeFunction();
	});

	test('what it takes compiles', () => {
		const taken = () => [
			trustProxy({ ...ranges, untrusted: 'refuse-all' }),
			trustProxy({
				trusted: '10.0.0.0/8',
				untrusted: 'refuse-all',
				allow: '127.0.0.1',
			}),
			trustProxy({
				trusted: (address) => address.startsWith('10.'),
				untrusted: 'refuse-all',
				allow: (request, peer) =>
					peer === '127.0.0.1' || new URL(request.url).pathname === '/health',
			}),
			trustProxy({ trusted: 1, canonical: false }),
			forwardedIp({ trusted: 1, canonical: false }),
		];
		expect(taken).toBeFunction();
	});
});
