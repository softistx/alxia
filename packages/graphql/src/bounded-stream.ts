/** What bounds a stream, and what keeps it authorized. All durations in ms. */
export interface BoundedStreamOptions {
	/** The stream ends, cleanly, after this long without an event. */
	idleMs: number;
	/** The stream ends, cleanly, this long after it began, however chatty. */
	totalMs: number;
	/** `check` runs at least this often, also while no event comes. */
	checkEveryMs: number;
	/**
	 * Before an event is yielded, `check` runs when the last check is at least
	 * this old. Default `0`: every event is checked. Raise it when events come
	 * in bursts and one check per event would cost more than the delay of a
	 * revocation it saves.
	 */
	checkDebounceMs?: number;
	/** Throws to refuse (a session that ended, a role that was lost). */
	check: () => Promise<void> | void;
	/** Turns what `check` (or the source) threw into the error the stream throws. Default: rethrown as is. */
	mapError?: (error: unknown) => unknown;
	/** Aborted when the client leaves: the stream ends and releases the source. */
	signal?: AbortSignal;
}

type Woke<T> =
	| { kind: 'read'; result: IteratorResult<T> }
	| { kind: 'failed'; error: unknown }
	| { kind: 'timer' }
	| { kind: 'interrupted' };

const DONE = { done: true, value: undefined } as const;

/**
 * `source` bounded by an idle and a total lifetime and re-checked while it
 * lives, to return as a subscription's `subscribe` result.
 *
 * It ends, without an error, when the source ends, on the idle bound, on the
 * total bound and on `signal`'s abort. It throws `mapError(error)` (the
 * error itself by default) when `check` fails, or when the source does. The
 * source's `return()` is called at once on the consumer's `return()` (a
 * client that disconnected) and on any end, even while a read is pending: the
 * iterator is written by hand because a generator's `return()` waits behind a
 * pending `next()`. Read it one `next()` at a time, as `for await` does. No
 * timer outlives a step.
 */
export function boundedStream<T>(
	source: AsyncIterable<T> | AsyncIterator<T>,
	options: BoundedStreamOptions,
): AsyncIterableIterator<T> {
	const { idleMs, totalMs, checkEveryMs, check, signal } = options;
	const debounceMs = options.checkDebounceMs ?? 0;
	const mapError = options.mapError ?? ((error: unknown) => error);
	const iterator: AsyncIterator<T> =
		Symbol.asyncIterator in source
			? (source as AsyncIterable<T>)[Symbol.asyncIterator]()
			: (source as AsyncIterator<T>);

	const startedAt = Date.now();
	let lastEventAt = startedAt;
	let lastCheckAt = startedAt;
	let finished = false;
	let interrupt: (() => void) | undefined;
	let pending: Promise<IteratorResult<T>> | undefined;
	let released: Promise<void> | undefined;

	const release = (): Promise<void> => {
		finished = true;
		interrupt?.();
		released ??= (async () => {
			try {
				await iterator.return?.(undefined);
			} catch {}
		})();
		return released;
	};

	const onAbort = () => void release();
	if (signal?.aborted) void release();
	else signal?.addEventListener('abort', onAbort, { once: true });
	const detach = () => signal?.removeEventListener('abort', onAbort);

	const checked = async () => {
		await check();
		lastCheckAt = Date.now();
	};

	// Waits for the source, the nearest bound or the abort, whichever is first.
	const wait = (read: Promise<IteratorResult<T>>, ms: number) =>
		new Promise<Woke<T>>((resolve) => {
			const settle = (woke: Woke<T>) => {
				clearTimeout(timer);
				interrupt = undefined;
				resolve(woke);
			};
			const timer = setTimeout(() => settle({ kind: 'timer' }), ms);
			interrupt = () => settle({ kind: 'interrupted' });
			read.then(
				(result) => settle({ kind: 'read', result }),
				(error: unknown) => settle({ kind: 'failed', error }),
			);
		});

	const step = async (): Promise<IteratorResult<T>> => {
		for (;;) {
			if (finished) return DONE;
			const t = Date.now();
			const left = [totalMs - (t - startedAt), idleMs - (t - lastEventAt)];
			if (Math.min(...left) <= 0) {
				await release();
				return DONE;
			}
			const dueIn = checkEveryMs - (t - lastCheckAt);
			if (dueIn <= 0) {
				await checked();
				continue;
			}
			if (!pending) {
				pending = iterator.next();
				pending.catch(() => {});
			}
			const woke = await wait(pending, Math.max(1, Math.min(dueIn, ...left)));
			if (woke.kind === 'interrupted') {
				await release();
				return DONE;
			}
			if (woke.kind === 'timer') continue;
			pending = undefined;
			if (woke.kind === 'failed') throw woke.error;
			if (woke.result.done) {
				await release();
				return DONE;
			}
			lastEventAt = Date.now();
			if (lastEventAt - lastCheckAt >= debounceMs) await checked();
			if (finished) return DONE;
			return { done: false, value: woke.result.value };
		}
	};

	const stream: AsyncIterableIterator<T> = {
		[Symbol.asyncIterator]: () => stream,
		next: async () => {
			try {
				const result = await step();
				if (result.done) detach();
				return result;
			} catch (error) {
				await release();
				detach();
				throw mapError(error);
			}
		},
		return: async () => {
			await release();
			detach();
			return DONE;
		},
	};
	return stream;
}
