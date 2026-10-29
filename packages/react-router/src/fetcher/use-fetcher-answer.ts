import { useEffect, useRef, useState } from 'react';

/** What the hook reads of a React Router fetcher. */
export interface AnswerSource<Data> {
	readonly state: string;
	readonly data: Data | undefined;
}

/**
 * The answers a fetcher gives, one at a time. A keyed fetcher outlives its
 * component, so the data it holds when the component mounts is an earlier
 * visit's, not this one's. `onAnswer` is called once for each answer that
 * arrives while the fetcher is idle and is another object than the last one
 * seen (the data present at mount counts as seen). The handler is read from
 * a ref, so a new function each render never re-fires it. Returns the latest
 * answer handed over, `undefined` until one arrives.
 */
export function useFetcherAnswer<Data>(
	fetcher: AnswerSource<Data>,
	onAnswer?: (answer: Data) => void,
): Data | undefined {
	const seen = useRef(fetcher.data);
	const handler = useRef(onAnswer);
	handler.current = onAnswer;
	const [latest, setLatest] = useState<Data | undefined>(undefined);
	const answer = fetcher.state === 'idle' ? fetcher.data : undefined;
	useEffect(() => {
		if (answer === undefined || answer === null || answer === seen.current) {
			return;
		}
		seen.current = answer;
		setLatest(answer);
		handler.current?.(answer);
	}, [answer]);
	return latest;
}
