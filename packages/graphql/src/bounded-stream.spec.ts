import { describe, expect, test } from 'bun:test';
import { boundedStream } from './bounded-stream';

// A source the spec drives: `push` makes `next()` resolve, `closed` counts return().
function channel<T>() {
	const queue: T[] = [];
	let wake: (() => void) | undefined;
	const state = { returned: 0 };
	const source: AsyncIterableIterator<T> = {
		[Symbol.asyncIterator]: () => source,
		next: async () => {
			while (queue.length === 0) await new Promise<void>((r) => (wake = r));
			return { done: false, value: queue.shift() as T };
		},
		return: async () => {
			state.returned++;
			return { done: true, value: undefined };
		},
	};
	return {
		source,
		state,
		push: (v: T) => {
			queue.push(v);
			wake?.();
		},
	};
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const base = { idleMs: 1000, totalMs: 1000, checkEveryMs: 1000 };

describe('boundedStream', () => {
	test('yields the source events and ends when it ends', async () => {
		async function* three() {
			yield 1;
			yield 2;
		}
		const out: number[] = [];
		for await (const n of boundedStream(three(), { ...base, check() {} }))
			out.push(n);
		expect(out).toEqual([1, 2]);
	});

	test('ends cleanly on idle and releases the source', async () => {
		const c = channel<number>();
		const stream = boundedStream(c.source, { ...base, idleMs: 30, check() {} });
		const started = Date.now();
		expect(await stream.next()).toEqual({ done: true, value: undefined });
		expect(Date.now() - started).toBeLessThan(500);
		expect(c.state.returned).toBe(1);
	});

	test('ends cleanly on the total bound despite events', async () => {
		const c = channel<number>();
		const ticker = setInterval(() => c.push(1), 10);
		const stream = boundedStream(c.source, {
			...base,
			totalMs: 60,
			check() {},
		});
		let n = 0;
		for await (const _ of stream) n++;
		clearInterval(ticker);
		expect(n).toBeGreaterThan(0);
		expect(c.state.returned).toBe(1);
	});

	test('checks every checkEveryMs while idle', async () => {
		const c = channel<number>();
		let checks = 0;
		const stream = boundedStream(c.source, {
			idleMs: 120,
			totalMs: 1000,
			checkEveryMs: 20,
			check: () => void checks++,
		});
		expect(await stream.next()).toEqual({ done: true, value: undefined });
		expect(checks).toBeGreaterThanOrEqual(3);
	});

	test('checks before an event only when the last check is older than the debounce', async () => {
		const c = channel<number>();
		let checks = 0;
		const stream = boundedStream(c.source, {
			...base,
			checkDebounceMs: 50,
			check: () => void checks++,
		});
		c.push(1);
		await stream.next();
		expect(checks).toBe(0); // last check (the start) is fresh
		await sleep(70);
		c.push(2);
		await stream.next();
		expect(checks).toBe(1);
		c.push(3);
		await stream.next();
		expect(checks).toBe(1); // debounced
		await stream.return?.();
	});

	test('a failing check throws mapError(error) and releases the source', async () => {
		const c = channel<number>();
		const stream = boundedStream(c.source, {
			...base,
			check() {
				throw new Error('revoked');
			},
			mapError: (e) => new Error(`mapped: ${(e as Error).message}`),
		});
		c.push(1);
		await expect(stream.next()).rejects.toThrow('mapped: revoked');
		expect(c.state.returned).toBe(1);
	});

	test('rethrows the check error by default', async () => {
		const c = channel<number>();
		const boom = new Error('boom');
		const stream = boundedStream(c.source, {
			...base,
			check: async () => {
				throw boom;
			},
		});
		c.push(1);
		await expect(stream.next()).rejects.toBe(boom);
	});

	test('return() releases the source at once, even with a read pending', async () => {
		const c = channel<number>();
		const stream = boundedStream(c.source, { ...base, check() {} });
		const reading = stream.next();
		await sleep(5);
		await stream.return?.();
		expect(c.state.returned).toBe(1);
		expect(await reading).toEqual({ done: true, value: undefined });
	});

	test('an abort of the signal ends the stream and releases the source', async () => {
		const c = channel<number>();
		const ctl = new AbortController();
		const stream = boundedStream(c.source, {
			...base,
			signal: ctl.signal,
			check() {},
		});
		const reading = stream.next();
		ctl.abort();
		expect(await reading).toEqual({ done: true, value: undefined });
		expect(c.state.returned).toBe(1);
	});

	test('accepts a bare AsyncIterator', async () => {
		const c = channel<number>();
		const bare: AsyncIterator<number> = {
			next: () => c.source.next(),
			return: () => c.source.return?.() as Promise<IteratorResult<number>>,
		};
		const stream = boundedStream(bare, { ...base, check() {} });
		c.push(7);
		expect(await stream.next()).toEqual({ done: false, value: 7 });
		await stream.return?.();
		expect(c.state.returned).toBe(1);
	});

	test('leaves no timer behind', async () => {
		const set = globalThis.setTimeout.bind(globalThis);
		const clear = globalThis.clearTimeout.bind(globalThis);
		const live = new Set<unknown>();
		globalThis.setTimeout = ((fn: () => void, ms?: number) => {
			const t = set(() => {
				live.delete(t);
				fn();
			}, ms);
			live.add(t);
			return t;
		}) as unknown as typeof setTimeout;
		globalThis.clearTimeout = ((t: never) => {
			live.delete(t);
			clear(t);
		}) as unknown as typeof clearTimeout;
		try {
			const c = channel<number>();
			const stream = boundedStream(c.source, { ...base, check() {} });
			c.push(1);
			await stream.next();
			const reading = stream.next();
			await stream.return?.();
			await reading;
			expect(live.size).toBe(0);
		} finally {
			globalThis.setTimeout = set;
			globalThis.clearTimeout = clear;
		}
	});

	test('a source that throws ends the stream with mapError(error)', async () => {
		async function* broken(): AsyncGenerator<number> {
			yield 1;
			throw new Error('source down');
		}
		const stream = boundedStream(broken(), {
			...base,
			check() {},
			mapError: (e) => new Error(`mapped: ${(e as Error).message}`),
		});
		expect(await stream.next()).toEqual({ done: false, value: 1 });
		await expect(stream.next()).rejects.toThrow('mapped: source down');
	});

	test('an event is not yielded when the stream was released during its check', async () => {
		const c = channel<number>();
		const ctl = new AbortController();
		const stream = boundedStream(c.source, {
			...base,
			signal: ctl.signal,
			check: async () => {
				ctl.abort();
				await sleep(5);
			},
		});
		c.push(1);
		expect(await stream.next()).toEqual({ done: true, value: undefined });
		expect(c.state.returned).toBe(1);
	});
});
