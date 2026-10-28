/**
 * `@alxia/react-router/lists`: the hooks of a list screen whose state is the
 * URL (a search, filters, a cursor). `react` and `react-router` are its only
 * imports, and every hook renders on the server.
 */

export {
	DEFAULT_CURSOR_PARAM,
	type PagedRows,
	type PagedRowsOptions,
	usePagedRows,
} from './use-paged-rows';
export { useSameRouteLoading } from './use-same-route-loading';
export {
	type SearchChange,
	type SearchChangeOptions,
	useSearchChange,
} from './use-search-change';
