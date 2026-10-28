import { useCallback, useEffect, useRef, useState } from 'react';
import { useFetcher, useLocation } from 'react-router';

export interface PagedRowsOptions<Page> {
	/** The search parameter that carries the cursor (default `after`). */
	readonly cursorParam?: string;
	/** The cursor of the page after this one, `null` at the end (default `page.next`). */
	readonly nextOf?: (page: Page) => string | null;
}

export interface PagedRows<Row> {
	/** The first page's rows, then the rows of each page loaded after it. */
	readonly rows: readonly Row[];
	/** The cursor of the next page, `null` when there is none. */
	readonly next: string | null;
	/** A page is being fetched. */
	readonly loading: boolean;
	/**
	 * The last `loadMore` ended with nothing usable (the route answered something
	 * that is not a page). The rows stay; call `loadMore` again to retry. The
	 * next `loadMore` clears it.
	 */
	readonly error: boolean;
	/** Fetches the page after the last one; nothing when there is none or one is on its way. */
	readonly loadMore: () => void;
}

interface Loaded<Page, Row> {
	readonly first: Page;
	readonly extra: readonly Row[];
	readonly next: string | null;
	readonly error: boolean;
}

/**
 * Appends the pages a "load more" asks of the route the page is on. The
 * route's loader answers `?<cursorParam>=<next>` with the next page, through
 * `useFetcher`, so the address bar and the page's own data stay as they are.
 *
 * - It starts over whenever `firstPage` is another object (a new search, a
 *   revalidation): the rows are the new first page's alone, in that very
 *   render. A page still on its way for the old one is dropped.
 * - A failed load keeps the rows and sets `error`. A thrown loader error goes
 *   to the route's `ErrorBoundary` as React Router always does; `error` covers
 *   an answer that is not a page, such as `data({ message }, { status: 503 })`
 *   or `null`.
 * - Data of the fetcher that is not a page (no rows, or no cursor) is ignored.
 */
export function usePagedRows<Page, Row>(
	firstPage: Page,
	rowsOf: (page: Page) => readonly Row[],
	options: PagedRowsOptions<Page> = {},
): PagedRows<Row> {
	const cursorParam = options.cursorParam ?? 'after';
	const nextOf =
		options.nextOf ??
		((page: Page) => (page as { next?: string | null }).next as string | null);
	const fetcher = useFetcher();
	const { pathname, search } = useLocation();
	const [loaded, setLoaded] = useState<Loaded<Page, Row>>({
		first: firstPage,
		extra: [],
		next: nextOf(firstPage) ?? null,
		error: false,
	});
	// What was asked, and for which first page, so an answer that comes after a restart is dropped.
	const asked = useRef<{ first: Page; seen: unknown; started: boolean } | null>(
		null,
	);
	const current: Loaded<Page, Row> =
		loaded.first === firstPage
			? loaded
			: {
					first: firstPage,
					extra: [],
					next: nextOf(firstPage) ?? null,
					error: false,
				};

	useEffect(() => {
		const request = asked.current;
		if (request === null) return;
		if (fetcher.state !== 'idle') {
			request.started = true;
			return;
		}
		if (!request.started) return;
		asked.current = null;
		if (request.first !== firstPage) return;
		const data = fetcher.data;
		// A page has rows and a cursor (a string, or null at the end); anything else is not one.
		const read = (value: unknown) => {
			if (typeof value !== 'object' || value === null) return undefined;
			try {
				const page = value as Page;
				const rows = rowsOf(page);
				const next = nextOf(page);
				if (!Array.isArray(rows)) return undefined;
				if (next !== null && typeof next !== 'string') return undefined;
				return { rows: rows as readonly Row[], next };
			} catch {
				return undefined;
			}
		};
		const more = data === request.seen ? undefined : read(data);
		setLoaded((previous) => {
			const base =
				previous.first === firstPage
					? previous
					: {
							first: firstPage,
							extra: [],
							next: nextOf(firstPage) ?? null,
							error: false,
						};
			if (more === undefined) return { ...base, error: true };
			return {
				...base,
				extra: [...base.extra, ...more.rows],
				next: more.next,
				error: false,
			};
		});
	}, [fetcher.state, fetcher.data, firstPage]);

	const next = current.next;
	const busy = fetcher.state !== 'idle';
	const { load } = fetcher;
	const loadMore = useCallback(() => {
		if (next === null || busy) return;
		const params = new URLSearchParams(search);
		params.set(cursorParam, next);
		asked.current = { first: firstPage, seen: fetcher.data, started: false };
		setLoaded({ ...current, error: false });
		void load(`${pathname}?${params}`);
	}, [
		next,
		busy,
		search,
		cursorParam,
		firstPage,
		fetcher.data,
		current,
		pathname,
		load,
	]);

	return {
		rows: [...rowsOf(firstPage), ...current.extra],
		next,
		loading: busy,
		error: current.error,
		loadMore,
	};
}
