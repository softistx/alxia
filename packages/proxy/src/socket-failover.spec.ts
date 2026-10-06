import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { closedPort } from '../test/pool';
import { client, socketUpstream } from '../test/sockets';
import { raw, serve, until, upstream } from '../test/upstream';
import { proxy } from './index';

/** An upgrade request, as a client sends it, for `raw`. */
const UPGRADE =
	'GET /live HTTP/1.1\r\nHost: x\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
	'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n';

describe('proxy.ws over several upstreams', () => {
	test('a refused connect goes to the next upstream, before the upgrade', async () => {
		const { up, state } = socketUpstream();
		const url = serve(alxia().ws('/live', proxy.ws([closedPort(), up.url])));
		const { socket, received, opened } = await client(url, '/live');
		expect(opened).toBe(true);
		socket.send('hi');
		await until(() => received.length === 1);
		expect(received).toEqual(['text:hi']);
		expect(state.upgraded).toHaveLength(1);
		socket.close();
	});

	test('sockets go round-robin', async () => {
		const one = socketUpstream();
		const two = socketUpstream();
		const url = serve(alxia().ws('/live', proxy.ws([one.up.url, two.up.url])));
		for (let i = 0; i < 4; i++) (await client(url, '/live')).socket.close();
		expect(one.state.upgraded).toHaveLength(2);
		expect(two.state.upgraded).toHaveLength(2);
	});

	test('an upstream that refused the upgrade was reached: a 502, not retried', async () => {
		const refusing = upstream(() => new Response('no', { status: 426 }));
		const { up, state } = socketUpstream();
		const url = serve(alxia().ws('/live', proxy.ws([refusing.url, up.url])));
		const answer = await raw(url, UPGRADE);
		expect(answer.startsWith('HTTP/1.1 502')).toBe(true);
		expect(state.upgraded).toHaveLength(0);
	});

	test('every upstream down is a 502 over HTTP', async () => {
		const url = serve(
			alxia().ws('/live', proxy.ws([closedPort(), closedPort()])),
		);
		const answer = await raw(url, UPGRADE);
		expect(answer.startsWith('HTTP/1.1 502')).toBe(true);
		expect(answer).toContain('bad_gateway');
	});
});
