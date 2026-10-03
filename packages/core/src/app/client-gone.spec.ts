import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import { connect } from 'node:net';
import { alxia } from '../index';
import { CLIENT_GONE } from './send';

afterEach(() => {
	(console.error as unknown as { mockRestore?: () => void }).mockRestore?.();
});

/** Sends half a chunked body to `port`, then hangs up. */
async function hangUpMidBody(port: number): Promise<void> {
	const socket = connect(port, '127.0.0.1');
	await new Promise((resolve) => socket.once('connect', resolve));
	socket.write(
		'POST /up HTTP/1.1\r\nHost: x\r\nContent-Type: text/plain\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n',
	);
	await Bun.sleep(50);
	socket.destroy();
}

async function until(done: () => boolean): Promise<void> {
	for (let i = 0; i < 100 && !done(); i++) await Bun.sleep(10);
}

describe('a client that hangs up mid-body', () => {
	test('is no app error: nothing logged, no onError, a 499 for onResponse', async () => {
		const logged = spyOn(console, 'error').mockImplementation(() => {});
		const seen: number[] = [];
		let handled = false;
		const app = alxia()
			.onResponse((response) => {
				seen.push(response.status);
			})
			.onError(() => {
				handled = true;
				return undefined;
			})
			.post('/up', async ({ request, reply }) =>
				reply(200, await request.text()),
			);
		const server = app.listen({ port: 0 });
		try {
			await hangUpMidBody(server.port as number);
			await until(() => seen.length > 0);
			expect(seen).toEqual([CLIENT_GONE]);
			expect(handled).toBe(false);
			expect(logged).not.toHaveBeenCalled();
		} finally {
			server.stop(true);
		}
	});

	test('a validated body is no app error either', async () => {
		const logged = spyOn(console, 'error').mockImplementation(() => {});
		const seen: number[] = [];
		const Text = {
			'~standard': {
				version: 1,
				vendor: 'x',
				validate: (value: unknown) => ({ value }),
			},
		} as const;
		const app = alxia()
			.onResponse((response) => {
				seen.push(response.status);
			})
			.post('/up', { body: Text }, ({ reply }) => reply(200, 'ok'));
		const server = app.listen({ port: 0 });
		try {
			await hangUpMidBody(server.port as number);
			await until(() => seen.length > 0);
			expect(seen).toEqual([CLIENT_GONE]);
			expect(logged).not.toHaveBeenCalled();
		} finally {
			server.stop(true);
		}
	});

	test('an error of the app is still logged and answered 500', async () => {
		const logged = spyOn(console, 'error').mockImplementation(() => {});
		const app = alxia().post('/up', () => {
			throw new DOMException('the app aborted its own fetch', 'AbortError');
		});
		const response = await app.request('/up', { method: 'POST', body: 'x' });
		expect(response.status).toBe(500);
		expect(logged).toHaveBeenCalledTimes(1);
	});
});
