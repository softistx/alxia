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

/** The default cursor parameter, shared with `useSearchChange`'s default `resetKeys`. */
export const DEFAULT_CURSOR_PARAM = 'after';

interface Loaded<Page, Row> {
	readonly first: Page;
	readonly extra: readonly Row[];
	readonly next: string | null;
	readonly error: boolean;
}

type NextOf<Page> = (page: Page) => string | null;

/** The state for a first page: nothing loaded after it yet. */
function restart<Page, Row>(
	first: Page,
	nextOf: NextOf<Page>,
): Loaded<Page, Row> {
	return { first, extra: [], next: nextOf(first) ?? null, error: false };
}

/**
 * The rows and cursor of `value` when it is a page (an object whose rows are
 * an array and whose cursor is a string or `null`), else `undefined`.
 */
function readPage<Page, Row>(
	value: unknown,
	rowsOf: (page: Page) => readonly Row[],
	nextOf: NextOf<Page>,
): { rows: readonly Row[]; next: string | null } | undefined {
	if (typeof value !== 'object' || value === null) return undefined;
	try {
		const rows = rowsOf(value as Page);
		const next = nextOf(value as Page);
		if (!Array.isArray(rows)) return undefined;
		if (next !== null && typeof next !== 'string') return undefined;
		return { rows, next };
	} catch {
		return undefined;
	}
}

/** The state after an answer: its rows appended, or `error` when it was not a page. */
function settle<Page, Row>(
	previous: Loaded<Page, Row>,
	first: Page,
	more: { rows: readonly Row[]; next: string | null } | undefined,
	nextOf: NextOf<Page>,
): Loaded<Page, Row> {
	const base =
		previous.first === first ? previous : restart<Page, Row>(first, nextOf);
	if (more === undefined) return { ...base, error: true };
	return {
		...base,
		extra: [...base.extra, ...more.rows],
		next: more.next,
		error: false,
	};
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
	const cursorParam = options.cursorParam ?? DEFAULT_CURSOR_PARAM;
	const nextOf: NextOf<Page> =
		options.nextOf ??
		((page) => (page as { next?: string | null }).next as string | null);
	const fetcher = useFetcher();
	const { pathname, search } = useLocation();
	const [loaded, setLoaded] = useState(() =>
		restart<Page, Row>(firstPage, nextOf),
	);
	// What was asked, and for which first page, so an answer that comes after a restart is dropped.
	const asked = useRef<{ first: Page; seen: unknown; started: boolean } | null>(
		null,
	);
	const current =
		loaded.first === firstPage ? loaded : restart<Page, Row>(firstPage, nextOf);

	// Deliberate deps: rowsOf and nextOf are usually inline functions, new on
	// every render, and are read at the time of the answer; the effect must run
	// on the fetcher's settling, not on each render.
	useEffect(() => {
		const request = asked.current;
		if (request === null) return;
		if (fetcher.state !== 'idle') {
			request.started = true;
			return;
		}
		// Idle: the answer is in when the fetcher was seen busy, or when its data
		// is no longer the one it had at the call (an answer within one batch).
		if (!request.started && fetcher.data === request.seen) return;
		asked.current = null;
		if (request.first !== firstPage) return;
		const more =
			fetcher.data === request.seen
				? undefined
				: readPage(fetcher.data, rowsOf, nextOf);
		setLoaded((previous) => settle(previous, firstPage, more, nextOf));
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
