import { describe, expect, test } from 'bun:test';
import { alxia } from '@alxia/core';
import { client, socketUpstream } from '../test/sockets';
import { raw, serve, until } from '../test/upstream';
import { proxy } from './index';

/** The headers of an upgrade request, as a client sends them. */
const UPGRADE = {
	upgrade: 'websocket',
	connection: 'Upgrade',
	'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==',
	'sec-websocket-version': '13',
};

/** A target nothing listens on any more. */
function unreachable(): URL {
	const gone = Bun.serve({ port: 0, fetch: () => new Response() });
	const target = gone.url;
	gone.stop(true);
	return target;
}

describe('proxy.ws, the upstream opened before the upgrade', () => {
	test("the subprotocol the upstream chose is the one the client's 101 names", async () => {
		const { up, state } = socketUpstream({ choose: (offered) => offered[1] });
		const url = serve(alxia().ws('/live', proxy.ws(up.url)));
		const { socket, opened } = await client(url, '/live', ['v1', 'v2']);
		expect(opened).toBe(true);
		expect(socket.protocol).toBe('v2');
		expect(state.upgraded[0]?.headers['sec-websocket-protocol']).toBe('v1, v2');
		socket.close();
	});

	test('a client that offers no subprotocol gets none, and the upstream is offered none', async () => {
		const { up, state } = socketUpstream({ choose: () => undefined });
		const url = serve(alxia().ws('/live', proxy.ws(up.url)));
		const { socket, received, opened } = await client(url, '/live');
		expect(opened).toBe(true);
		expect(socket.protocol).toBe('');
		expect(state.upgraded[0]?.headers['sec-websocket-protocol']).toBe(
			undefined,
		);
		socket.send('x');
		await until(() => received.length === 1);
		expect(received).toEqual(['text:x']);
		socket.close();
	});

	test('what the upstream sends as it opens reaches the client', async () => {
		const { up } = socketUpstream({ greeting: 'welcome' });
		const url = serve(alxia().ws('/live', proxy.ws(up.url)));
		const { socket, received } = await client(url, '/live');
		socket.send('x');
		await until(() => received.length === 2);
		expect(received).toEqual(['welcome', 'text:x']);
		socket.close();
	});

	test('an upstream that cannot be reached answers a 502 over HTTP, and no socket opens', async () => {
		const url = serve(alxia().ws('/live', proxy.ws(unreachable())));
		const response = await fetch(new URL('/live', url), { headers: UPGRADE });
		expect(response.status).toBe(502);
		expect(await response.json()).toEqual({ error: 'bad_gateway' });
		const { opened, closed } = await client(url, '/live');
		expect(opened).toBe(false);
		expect(closed.code).not.toBe(1014);
	});

	test("the 502 is in the app's error format", async () => {
		const app = alxia({ errors: 'problem' }).ws(
			'/live',
			proxy.ws(unreachable()),
		);
		const response = await fetch(new URL('/live', serve(app)), {
			headers: UPGRADE,
		});
		expect(response.status).toBe(502);
		expect(response.headers.get('content-type')).toContain(
			'application/problem+json',
		);
	});

	test('an upstream that never completes the handshake answers a 504 past timeout', async () => {
		const silent = Bun.listen({
			hostname: '127.0.0.1',
			port: 0,
			socket: { data() {} }, // takes the connection, answers nothing
		});
		try {
			const target = `ws://127.0.0.1:${silent.port}`;
			const url = serve(
				alxia().ws('/live', proxy.ws(target, { timeout: 100 })),
			);
			const response = await fetch(new URL('/live', url), {
				headers: UPGRADE,
			});
			expect(response.status).toBe(504);
			expect(await response.json()).toEqual({ error: 'gateway_timeout' });
		} finally {
			silent.stop(true);
		}
	});

	test('a client gone during the connect closes the upstream', async () => {
		let asked = false;
		let aborted = false;
		const { up } = socketUpstream({
			before: async (request) => {
				asked = true;
				request.signal.addEventListener('abort', () => {
					aborted = true;
				});
				await until(() => aborted);
			},
		});
		const url = serve(alxia().ws('/live', proxy.ws(up.url)));
		const head = Object.entries(UPGRADE)
			.map(([name, value]) => `${name}: ${value}\r\n`)
			.join('');
		const gone = raw(url, `GET /live HTTP/1.1\r\nhost: x\r\n${head}\r\n`);
		await until(() => asked);
		expect(asked).toBe(true);
		await gone; // resolves when the raw client gives up and disconnects
		await until(() => aborted);
		expect(aborted).toBe(true);
	});
});
