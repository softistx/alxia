import { useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { DEFAULT_CURSOR_PARAM } from './use-paged-rows';

export interface SearchChangeOptions {
	/**
	 * The parameters dropped by every change, because they only mean something
	 * for the search they were read from (default `['after']`, a cursor).
	 */
	readonly resetKeys?: readonly string[];
}

const RESET_KEYS: readonly string[] = [DEFAULT_CURSOR_PARAM];

/** What `change` takes: a record of changes, a whole search, or an updater. */
export type SearchChange =
	| Record<string, string | null | undefined>
	| URLSearchParams
	| ((prev: URLSearchParams) => URLSearchParams);

/**
 * Returns `(changes) => void`. With a record it sets the parameters it is
 * given a value for, deletes the ones given `null` or `undefined` (an empty
 * string is a value, so it is set), and deletes `resetKeys` in the same step.
 * With a `URLSearchParams` it replaces the whole search by it, and with an
 * updater `(prev) => URLSearchParams` by what the updater returns; both are
 * the caller's whole search, so `resetKeys` does not apply. Every form
 * replaces the history entry and keeps the scroll position.
 */
export function useSearchChange(
	options: SearchChangeOptions = {},
): (changes: SearchChange) => void {
	const [, setSearchParams] = useSearchParams();
	const resetKeys = options.resetKeys ?? RESET_KEYS;
	const joined = resetKeys.join('\u0000');
	return useCallback(
		(changes) => {
			const navigation = { replace: true, preventScrollReset: true };
			if (typeof changes === 'function') {
				setSearchParams(
					(current) => changes(new URLSearchParams(current)),
					navigation,
				);
				return;
			}
			if (changes instanceof URLSearchParams) {
				setSearchParams(new URLSearchParams(changes), navigation);
				return;
			}
			setSearchParams((current) => {
				const next = new URLSearchParams(current);
				for (const [key, value] of Object.entries(changes)) {
					if (value === null || value === undefined) next.delete(key);
					else next.set(key, value);
				}
				for (const key of joined === '' ? [] : joined.split('\u0000'))
					next.delete(key);
				return next;
			}, navigation);
		},
		[setSearchParams, joined],
	);
}
