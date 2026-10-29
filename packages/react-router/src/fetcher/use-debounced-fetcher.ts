import { useCallback, useEffect, useRef, useState } from 'react';
import { useFetcher } from 'react-router';

/** What `useFetcher<Data>` hands back as `data` (`Data` may be `typeof loader`). */
type FetcherData<Data> = ReturnType<typeof useFetcher<Data>>['data'];

/** What `useDebouncedFetcher` is doing for the value typed. */
export type DebouncedFetcherState =
	/** Nothing to ask: disabled, or the value is shorter than `minLength`. */
	| 'idle'
	/** The value changed and the pause after the last change is running. */
	| 'waiting'
	/** The resource route is loading. */
	| 'loading'
	/** The route answered for the value as it stands. */
	| 'done';

export interface DebouncedFetcherOptions<Data = unknown> {
	/** Pause after the last change before the route is asked. Default 250. */
	readonly delayMs?: number;
	/** The trimmed value must have this many characters. Default 1. */
	readonly minLength?: number;
	/** `false` asks nothing and forgets the previous answer. Default `true`. */
	readonly enabled?: boolean;
	/** The fetcher's key, to share it with another component. */
	readonly key?: string;
	/**
	 * Which answers may be kept as the stale `data` while the next value waits
	 * or loads. Default: all. An answer it refuses (a failure) is still `data`
	 * while it is the current one, but is never shown as the previous one.
	 */
	readonly keep?: (data: NonNullable<FetcherData<Data>>) => boolean;
}

export interface DebouncedFetcher<Data> {
	/**
	 * The route's answer for the value as it stands, else (`stale`) the last
	 * answer for an earlier value, kept until the new one lands. `undefined`
	 * before any answer, and again once the hook goes `idle`.
	 */
	readonly data: FetcherData<Data>;
	/** `data` answers an earlier value (or none is current yet). */
	readonly stale: boolean;
	readonly state: DebouncedFetcherState;
	/** Asks the route again for the value as it stands, without waiting. */
	readonly retry: () => void;
}

/**
 * A resource route loaded through a fetcher for a value that changes as the
 * user types. After `delayMs` without a change, and from `minLength`
 * characters, it calls `fetcher.load` once (a newer load cancels the
 * previous one). An answer only counts for the value it was asked for: while
 * a newer value waits or loads, `data` is the previous answer with `stale`
 * set, and an answer for an older value is never returned as current.
 * `to` is the route's URL, or a function of the trimmed value that builds it
 * (a string without a function is loaded as it is, the value being only the
 * trigger). A refusal the route answers as data is `data` like any answer.
 */
export function useDebouncedFetcher<Data>(
	value: string,
	to: string | ((value: string) => string),
	options: DebouncedFetcherOptions<Data> = {},
): DebouncedFetcher<Data> {
	const { delayMs = 250, minLength = 1, enabled = true, key, keep } = options;
	const keepRef = useRef(keep);
	keepRef.current = keep;
	const fetcher = useFetcher<Data>(key === undefined ? undefined : { key });
	const load = useRef(fetcher.load);
	load.current = fetcher.load;
	const text = value.trim();
	const url =
		enabled && text.length >= minLength
			? typeof to === 'function'
				? to(text)
				: to
			: null;
	// The URL the fetcher was last told to load.
	const [loaded, setLoaded] = useState<string | null>(null);
	const previous = useRef<FetcherData<Data>>(undefined);

	// biome-ignore lint/correctness/useExhaustiveDependencies: the URL and the value are the trigger; `load` is read from a ref
	useEffect(() => {
		if (url === null) {
			previous.current = undefined;
			setLoaded(null);
			return;
		}
		const timer = setTimeout(() => {
			setLoaded(url);
			void load.current(url);
		}, delayMs);
		return () => clearTimeout(timer);
	}, [url, text, delayMs]);

	const current =
		url !== null &&
		loaded === url &&
		fetcher.state === 'idle' &&
		fetcher.data !== undefined;
	const answer = current ? fetcher.data : undefined;
	useEffect(() => {
		if (answer === undefined || answer === null) return;
		if (keepRef.current?.(answer) ?? true) previous.current = answer;
	}, [answer]);

	const data = current ? answer : url === null ? undefined : previous.current;
	let state: DebouncedFetcherState;
	if (url === null) state = 'idle';
	else if (loaded !== url) state = 'waiting';
	else state = fetcher.state === 'idle' ? 'done' : 'loading';

	const urlRef = useRef(url);
	urlRef.current = url;
	const retry = useCallback(() => {
		const now = urlRef.current;
		if (now === null) return;
		setLoaded(now);
		void load.current(now);
	}, []);
	return { data, stale: state !== 'done' && data !== undefined, state, retry };
}
