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

/**
 * Returns `(changes) => void`: sets the parameters it is given a value for,
 * deletes the ones given `null` or `undefined` (an empty string is a value,
 * so it is set), and deletes `resetKeys` in
 * the same step. It replaces the history entry and keeps the scroll position.
 */
export function useSearchChange(
	options: SearchChangeOptions = {},
): (changes: Record<string, string | null | undefined>) => void {
	const [, setSearchParams] = useSearchParams();
	const resetKeys = options.resetKeys ?? RESET_KEYS;
	const joined = resetKeys.join('\u0000');
	return useCallback(
		(changes) => {
			setSearchParams(
				(current) => {
					const next = new URLSearchParams(current);
					for (const [key, value] of Object.entries(changes)) {
						if (value === null || value === undefined) next.delete(key);
						else next.set(key, value);
					}
					for (const key of joined === '' ? [] : joined.split('\u0000'))
						next.delete(key);
					return next;
				},
				{ replace: true, preventScrollReset: true },
			);
		},
		[setSearchParams, joined],
	);
}
