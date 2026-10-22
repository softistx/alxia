import { describe, expect, test } from 'bun:test';
import { type TrustProxyOptions, trustProxy } from './trust-proxy';

const secret = {
	header: 'x-app-proxy-secret',
	value: 'k3y-0f-sixteen+chars',
};

function read(
	options: TrustProxyOptions,
	headers: Record<string, string>,
	peer: string | null = '10.0.0.1',
) {
	const server =
		peer === null
			? undefined
			: ({
					requestIP: () => ({ address: peer }),
				} as unknown as Bun.Server<unknown>);
	return trustProxy(options)(
		new Request('http://app.internal:3000/', { headers }),
		server,
	);
}

const said = {
	'x-forwarded-for': '203.0.113.9, 10.0.0.2',
	'x-forwarded-proto': 'https',
	'x-forwarded-host': 'example.com',
	'x-forwarded-port': '8443',
};
const right = { ...said, [secret.header]: secret.value };
const wrong = { ...said, [secret.header]: 'not-the-secret-at-all' };
const behind = { trusted: 2, secret } as const;

describe('the right secret', () => {
	test('a hop count reads ip, proto, host and port, whatever the peer', () => {
		expect(read(behind, right, '198.51.100.4')).toEqual({
			ip: '203.0.113.9',
			origin: {
				protocol: 'https:',
				host: { hostname: 'example.com', port: '8443' },
			},
			refused: false,
			secretHeader: secret.header,
		});
	});

	test('the secret header is named even when the secret is wrong or absent', () => {
		expect(read(behind, wrong).secretHeader).toBe(secret.header);
		expect(read(behind, said).secretHeader).toBe(secret.header);
	});

	test('no secret option: nothing is named', () => {
		expect(read({ trusted: 2 }, said).secretHeader).toBeUndefined();
	});

	test('either value of a rotation', () => {
		const both = {
			...behind,
			secret: { ...secret, value: ['another-secret-value-1', secret.value] },
		};
		expect(read(both, right).ip).toBe('203.0.113.9');
		expect(
			read(both, { ...said, [secret.header]: 'another-secret-value-1' }).ip,
		).toBe('203.0.113.9');
	});
});

describe('a wrong or missing secret', () => {
	test("'ignore' reads nothing and refuses nothing", () => {
		for (const headers of [wrong, said])
			expect(read(behind, headers, '198.51.100.4')).toMatchObject({
				ip: '198.51.100.4',
				origin: {},
				refused: false,
			});
	});

	test("'refuse': a wrong secret is refused for its headers, a probe with none passes", () => {
		const refuse = { ...behind, untrusted: 'refuse' } as const;
		expect(read(refuse, wrong, '198.51.100.4')).toMatchObject({
			refused: true,
			refusal: 'headers',
		});
		expect(read(refuse, said, '198.51.100.4')).toMatchObject({
			refused: true,
			refusal: 'headers',
		});
		expect(
			read(refuse, { [secret.header]: 'not-the-secret-at-all' }),
		).toMatchObject({ refused: true, refusal: 'headers' });
		expect(read(refuse, {}, '198.51.100.4').refused).toBeFalse();
		expect(read(refuse, right).refused).toBeFalse();
	});

	test("'refuse-all': refused for its peer unless allowed", () => {
		const strict = { ...behind, untrusted: 'refuse-all' } as const;
		expect(read(strict, wrong, '198.51.100.4')).toMatchObject({
			refused: true,
			refusal: 'peer',
		});
		expect(read(strict, {}, '198.51.100.4')).toMatchObject({
			refused: true,
			refusal: 'peer',
		});
		expect(read(strict, right).refused).toBeFalse();
		const allowed = { ...strict, allow: '127.0.0.1' } as const;
		expect(read(allowed, {}, '127.0.0.1')).toMatchObject({
			ip: '127.0.0.1',
			origin: {},
			refused: false,
		});
		expect(read(allowed, wrong, '198.51.100.4').refused).toBeTrue();
	});
});

describe('ranges and a secret', () => {
	const both = { trusted: ['10.0.0.0/8'], secret } as const;

	test('both must hold', () => {
		expect(read(both, right).ip).toBe('203.0.113.9');
		expect(read(both, right, '198.51.100.4')).toMatchObject({
			ip: '198.51.100.4',
			origin: {},
		});
		expect(read(both, wrong)).toMatchObject({ ip: '10.0.0.1', origin: {} });
		expect(read(both, said)).toMatchObject({ ip: '10.0.0.1', origin: {} });
	});

	test("under 'refuse', either failing refuses a request with headers", () => {
		const refuse = { ...both, untrusted: 'refuse' } as const;
		expect(read(refuse, right, '198.51.100.4').refused).toBeTrue();
		expect(read(refuse, wrong).refused).toBeTrue();
		expect(read(refuse, right).refused).toBeFalse();
	});
});

describe('types', () => {
	test('a hop count refuses only with a secret', () => {
		const types = () => [
			trustProxy({ trusted: 2, secret, untrusted: 'refuse' }),
			trustProxy({
				trusted: 2,
				secret,
				untrusted: 'refuse-all',
				allow: '127.0.0.1',
			}),
			// @ts-expect-error a hop count cannot tell a proxy: no refusing without a secret
			trustProxy({ trusted: 2, untrusted: 'refuse' }),
			// @ts-expect-error a hop count cannot tell a proxy: no refusing without a secret
			trustProxy({ trusted: 2, untrusted: 'refuse-all' }),
		];
		expect(types).toBeFunction();
	});

	test('a hop count with a secret refuses at runtime too, without it throws', () => {
		expect(() =>
			trustProxy({ trusted: 2, secret, untrusted: 'refuse' }),
		).not.toThrow();
		expect(() =>
			trustProxy({ trusted: 2, untrusted: 'refuse' } as never),
		).toThrow(TypeError);
	});

	test('the secret header may not be the forwarding header', () => {
		expect(() =>
			trustProxy({
				trusted: 1,
				header: 'x-real-ip',
				secret: { header: 'x-real-ip', value: secret.value },
			}),
		).toThrow(TypeError);
	});
});
