import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

export interface LinkParamOptions {
	/**
	 * Remove the parameter from the address bar once read
	 * (`history.replaceState`), so a token is not left in the history, a
	 * bookmark or a shared screen. Default `false`.
	 */
	readonly drop?: boolean;
}

/**
 * The query parameter a mail's link carries (`token`, `code`, `state`),
 * read once: the value of the first render is kept for the page's life, so
 * dropping it from the address bar never loses it. `null` when absent or
 * empty. Safe to render on the server, where nothing is dropped.
 */
export function useLinkParam(
	name: string,
	{ drop = false }: LinkParamOptions = {},
): string | null {
	const [params] = useSearchParams();
	const [value] = useState(() => params.get(name) || null);
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
	}, [drop, name]);
	return value;
}
