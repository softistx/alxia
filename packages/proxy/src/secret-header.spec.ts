import { describe, expect, test } from 'bun:test';
import { alxia, trustProxy } from '@alxia/core';
import { socketUpstream } from '../test/sockets';
import { raw, serve, upstream } from '../test/upstream';
import { proxy } from './index';

const secret = {
	header: 'x-app-proxy-secret',
	value: 'k3y-0f-sixteen+chars',
};

const server = (peer: string) =>
	({ requestIP: () => ({ address: peer }) }) as unknown as Bun.Server<unknown>;

async function received(headers: Record<string, string>, peer = '10.0.0.1') {
	const up = upstream();
	const app = alxia({
		proxy: trustProxy({ trusted: ['10.0.0.0/8'], secret }),
	}).use(proxy(up.url));
	const response = await app.fetch(
		new Request('http://app.internal:3000/', { headers }),
		server(peer),
	);
	return ((await response.json()) as { headers: Record<string, string> })
		.headers;
}

describe('the proxy secret header', () => {
	test('is never forwarded when the secret is right', async () => {
		const headers = await received({
			'x-forwarded-for': '203.0.113.9',
			[secret.header]: secret.value,
			'x-kept': 'yes',
		});
		expect(headers[secret.header]).toBeUndefined();
		expect(JSON.stringify(headers)).not.toContain(secret.value);
		expect(headers['x-kept']).toBe('yes');
	});

	test('nor when it is wrong, or sent by a client that is no proxy', async () => {
		for (const [value, peer] of [
			['a-wrong-secret-value', '10.0.0.1'],
			[secret.value, '198.51.100.4'],
		] as const) {
			const headers = await received({ [secret.header]: value }, peer);
			expect(headers[secret.header]).toBeUndefined();
		}
	});
});

describe('the proxy secret header on a proxied socket', () => {
	test('is not forwarded on the upstream socket request', async () => {
		const { up, state } = socketUpstream();
		const url = serve(
			alxia({
				proxy: trustProxy({ trusted: ['127.0.0.0/8'], secret }),
			}).ws('/live', proxy.ws(up.url)),
		);
		const answer = await raw(
			url,
			'GET /live HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
				'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n' +
				`X-Forwarded-For: 203.0.113.9\r\n${secret.header}: ${secret.value}\r\nX-Kept: yes\r\n\r\n`,
		);
		expect(answer.startsWith('HTTP/1.1 101')).toBe(true);
		expect(state.upgraded).toHaveLength(1);
		const headers = state.upgraded[0]?.headers ?? {};
		expect(headers[secret.header]).toBeUndefined();
		expect(JSON.stringify(headers)).not.toContain(secret.value);
		expect(headers['x-kept']).toBe('yes');
	});
});
