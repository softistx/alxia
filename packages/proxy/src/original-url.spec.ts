import { describe, expect, test } from 'bun:test';
import { alxia, trustProxy } from '@alxia/core';
import { upstream } from '../test/upstream';
import { proxy } from './index';

/** A server whose every connection comes from `peer`. */
const from = (peer: string) =>
	({ requestIP: () => ({ address: peer }) }) as unknown as Bun.Server<unknown>;

const TLS_PROXY = from('10.0.0.1');
const CLIENT = from('198.51.100.4');

const saidByTlsProxy = {
	'x-forwarded-for': '203.0.113.9',
	'x-forwarded-proto': 'https',
	'x-forwarded-host': 'api.example.com',
};

async function sent(
	options: { behind: boolean; peer: Bun.Server<unknown> },
	proxied: { forwarded?: boolean; trustForwarded?: boolean } = {},
) {
	const up = upstream();
	const app = alxia(
		options.behind ? { proxy: trustProxy({ trusted: ['10.0.0.0/8'] }) } : {},
	).use(proxy(up.url, proxied));
	const response = await app.fetch(
		new Request('http://app.internal:3000/', { headers: saidByTlsProxy }),
		options.peer,
	);
	return ((await response.json()) as { headers: Record<string, string> })
		.headers;
}

describe('the forwarding headers behind a trusted TLS proxy', () => {
	test('carry the scheme and host the proxy said, so a chain stays truthful', async () => {
		const headers = await sent(
			{ behind: true, peer: TLS_PROXY },
			{ forwarded: true },
		);
		expect(headers['x-forwarded-proto']).toBe('https');
		expect(headers['x-forwarded-host']).toBe('api.example.com');
		expect(headers['forwarded']).toBe(
			'for=10.0.0.1;host=api.example.com;proto=https',
		);
	});

	test('without trustProxy, they are the request as the app received it', async () => {
		const headers = await sent(
			{ behind: false, peer: TLS_PROXY },
			{ forwarded: true },
		);
		expect(headers['x-forwarded-proto']).toBe('http');
		expect(headers['x-forwarded-host']).toBe('app.internal:3000');
		expect(headers['forwarded']).toContain(
			'host="app.internal:3000";proto=http',
		);
	});

	test('a direct client spoofing the headers changes nothing', async () => {
		const headers = await sent({ behind: true, peer: CLIENT });
		expect(headers['x-forwarded-proto']).toBe('http');
		expect(headers['x-forwarded-host']).toBe('app.internal:3000');
	});

	test('trustForwarded keeps its meaning: what arrived stays, trustProxy or not', async () => {
		const headers = await sent(
			{ behind: false, peer: CLIENT },
			{ trustForwarded: true },
		);
		expect(headers['x-forwarded-proto']).toBe('https');
		expect(headers['x-forwarded-host']).toBe('api.example.com');
	});
});
