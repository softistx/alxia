import { describe, expect, test } from 'bun:test';
import { ContentTooLargeError } from '@alxia/core';
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
		pick: (tried) => {
			const index = plans.findIndex((_, i) => !tried.has(i));
			return index === -1 ? undefined : index;
		},
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

	describe('watchBody, a declared Content-Length read as core reads it', () => {
		/** A three-byte body that ends. */
		const threeBytes = () =>
			new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new Uint8Array([1, 2, 3]));
					controller.close();
				},
			});

		const drain = async (stream: ReadableStream<Uint8Array>) => {
			let total = 0;
			for await (const chunk of stream) total += chunk.byteLength;
			return total;
		};

		test('a declared length past the limit throws before a byte is read', () => {
			expect(() => watchBody(source(), 8, '9')).toThrow(ContentTooLargeError);
		});

		test('a declared length with leading zeros is read as its value', () => {
			expect(() => watchBody(source(), 8, '0009')).toThrow(
				ContentTooLargeError,
			);
		});

		for (const malformed of ['1e3', '0x10', '-1', 'abc']) {
			test(`a malformed Content-Length ${malformed} is no declaration: the body is counted`, async () => {
				const body = watchBody(threeBytes(), 8, malformed);
				expect(await drain(body.stream)).toBe(3);
			});
		}
	});
});
