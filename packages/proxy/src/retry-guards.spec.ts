import { describe, expect, test } from 'bun:test';
import { watchBody } from './body';
import type { Plan } from './options';
import { acrossUpstreams, Unreached } from './retry';
import type { Pool } from './upstreams';

/** A pool of `n` upstreams that never cool down, recording each attempt. */
function stubPool(n: number): Pool {
	const plans = Array.from({ length: n }, () => ({}) as Plan);
	return {
		plans,
		retries: n - 1,
		pick: (tried) => plans.findIndex((_, i) => !tried.has(i)),
		failed: () => {},
		reached: () => {},
	};
}

describe('acrossUpstreams, the guards before a retry', () => {
	test('a request that cannot be sent again is not: its first failure answers it', async () => {
		let calls = 0;
		const sent = acrossUpstreams(
			stubPool(3),
			new AbortController().signal,
			() => false,
			async () => {
				calls++;
				throw new Unreached('first');
			},
		);
		await expect(sent).rejects.toBe('first');
		expect(calls).toBe(1);
	});

	test('a client gone after the first attempt stops the retries', async () => {
		const client = new AbortController();
		let calls = 0;
		const sent = acrossUpstreams(
			stubPool(3),
			client.signal,
			() => true,
			async () => {
				calls++;
				client.abort();
				throw new Unreached('first');
			},
		);
		await expect(sent).rejects.toBe('first');
		expect(calls).toBe(1);
	});

	test('otherwise each upstream is tried once, and the last failure answers', async () => {
		let calls = 0;
		const sent = acrossUpstreams(
			stubPool(3),
			new AbortController().signal,
			() => true,
			async () => {
				calls++;
				throw new Unreached(`attempt ${calls}`);
			},
		);
		await expect(sent).rejects.toBe('attempt 3');
		expect(calls).toBe(3);
	});
});

describe('watchBody, whether the body is still whole', () => {
	const source = () =>
		new ReadableStream<Uint8Array>({
			pull(controller) {
				controller.enqueue(new Uint8Array([1]));
			},
		});

	test('nothing is read until the upstream asks', async () => {
		const body = watchBody(source(), undefined, null);
		await Bun.sleep(5);
		expect(body.started()).toBe(false);
		await body.stream.getReader().read();
		expect(body.started()).toBe(true);
	});

	test('a cancelled body is no longer whole', async () => {
		const body = watchBody(source(), undefined, null);
		await body.stream.cancel();
		expect(body.started()).toBe(true);
	});
});
