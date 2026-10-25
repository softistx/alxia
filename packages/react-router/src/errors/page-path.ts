/**
 * The page a request is for, as `next` carries it back after sign-in: its
 * path and search, without React Router's single-fetch details. A client
 * navigation's `request.url` is `/todos/demo/list.data?q=a&_routes=…`
 * (`/_.data` for `/`, `?index` for an index action), as the server
 * runtime's own `normalizeUrl` strips them.
 */
export function nextOf(url: string): string {
	const { pathname, searchParams } = new URL(url);
	const path = pathname.endsWith('/_.data')
		? pathname.slice(0, -'_.data'.length)
		: pathname.replace(/\.data$/, '');
	const params = new URLSearchParams(searchParams);
	params.delete('_routes');
	// An empty `index` names the index route; a valued one is the page's own.
	for (const value of params.getAll('index')) {
		if (!value) params.delete('index', value);
	}
	const search = params.toString();
	return search ? `${path}?${search}` : path;
}
