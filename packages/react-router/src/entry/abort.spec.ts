import { afterEach, beforeEach, describe, expect, jest, test } from 'bun:test';
import { deadline, untilDone } from './abort';

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

const bytes = (...parts: string[]) =>
	new ReadableStream<Uint8Array>({
		start(controller) {
			for (const part of parts)
				controller.enqueue(new TextEncoder().encode(part));
			controller.close();
		},
	});

describe('deadline', () => {
	test('aborts its signal after the delay, not before', () => {
		const { signal } = deadline(6_000);
		jest.advanceTimersByTime(5_999);
		expect(signal.aborted).toBe(false);
		jest.advanceTimersByTime(1);
		expect(signal.aborted).toBe(true);
	});

	test('does not abort once cleared, and clearing twice is harmless', () => {
		const { signal, clear } = deadline(6_000);
		clear();
		clear();
		jest.advanceTimersByTime(60_000);
		expect(signal.aborted).toBe(false);
	});
});

describe('untilDone', () => {
	test('passes the bytes through and calls done at the end, once', async () => {
		let done = 0;
		const text = await new Response(
			untilDone(bytes('a', 'b'), () => done++),
		).text();
		expect(text).toBe('ab');
		expect(done).toBe(1);
	});

	test('clears the timer when the body ends', async () => {
		const { signal, clear } = deadline(6_000);
		await new Response(untilDone(bytes('x'), clear)).text();
		jest.advanceTimersByTime(60_000);
		expect(signal.aborted).toBe(false);
	});

	test('clears the timer when the client cancels, and cancels the source', async () => {
		let cancelled: unknown;
		const source = new ReadableStream<Uint8Array>({
			cancel: (reason) => {
				cancelled = reason;
			},
		});
		const { signal, clear } = deadline(6_000);
		await untilDone(source, clear).cancel('gone');
		jest.advanceTimersByTime(60_000);
		expect(signal.aborted).toBe(false);
		expect(cancelled).toBe('gone');
	});

	test('calls done and fails the same way when the source errors', async () => {
		let done = 0;
		const source = new ReadableStream<Uint8Array>({
			pull: () => {
				throw new Error('broken');
			},
		});
		await expect(
			new Response(untilDone(source, () => done++)).text(),
		).rejects.toThrow('broken');
		expect(done).toBe(1);
	});

	test('an unfinished body leaves the timer to abort the render', () => {
		const { signal, clear } = deadline(6_000);
		untilDone(new ReadableStream<Uint8Array>({}), clear);
		jest.advanceTimersByTime(6_000);
		expect(signal.aborted).toBe(true);
	});
});
