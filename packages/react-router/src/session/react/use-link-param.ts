import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';

export interface LinkParamOptions {
	/**
	 * Remove the parameter from the address bar once read
	 * (`history.replaceState`), so a token is not left in the history, a
	 * bookmark or a shared screen. Default `false`.
	 */
	readonly drop?: boolean;
	/**
	 * Follow the URL instead of reading it once. A parameter that a redirect
	 * or a link adds to the SAME mounted route (`?state=linked`) is seen, and
	 * each new location is read again. Without `drop` the value is the
	 * parameter of the current location. With `drop` the value is kept after
	 * the address bar loses the parameter, until a location carries a new
	 * one: a navigation that has none does not clear it. Default `false`.
	 */
	readonly live?: boolean;
}

/**
 * The query parameter a mail's link carries (`token`, `code`, `state`),
 * read once: the value of the first render is kept for the page's life, so
 * dropping it from the address bar never loses it. With `live: true` it
 * follows the URL instead (see `LinkParamOptions`). `null` when absent or
 * empty. Safe to render on the server, where nothing is dropped.
 */
export function useLinkParam(
	name: string,
	{ drop = false, live = false }: LinkParamOptions = {},
): string | null {
	const [params] = useSearchParams();
	const { key } = useLocation();
	const followed = live ? key : null;
	const current = params.get(name) || null;
	const [kept, setKept] = useState(current);
	const [seen, setSeen] = useState(current);
	if (live && current !== seen) {
		setSeen(current);
		if (!drop || current !== null) setKept(current);
	}
	useEffect(() => {
		if (!drop) return;
		const url = new URL(window.location.href);
		if (!url.searchParams.has(name)) return;
		url.searchParams.delete(name);
		window.history.replaceState(
			window.history.state,
			'',
			`${url.pathname}${url.search}${url.hash}`,
		);
	}, [drop, name, followed]);
	if (live && !drop) return current;
	return kept;
}
