# Lists whose state is the URL

A list screen of a BFF keeps its state in the address bar: `?q=ana&status=open`
for a search and filters, `?after=<cursor>` for the page. The loader reads it;
the screen changes it. `@alxia/react-router/lists` holds the three hooks every
such screen needs. `react` and `react-router` are its only imports, so it adds
no peer beyond those, and every hook renders on the server.

```tsx
import {
	usePagedRows,
	useSameRouteLoading,
	useSearchChange,
} from '@alxia/react-router/lists';
```

## The loader

One loader serves the first page and the next ones. It reads the cursor and
answers `{ items, next }`, `next` being `null` on the last page:

```ts
export async function loader({ request }: Route.LoaderArgs) {
	const url = new URL(request.url);
	return {
		page: await listUsers({
			q: url.searchParams.get('q') ?? '',
			after: url.searchParams.get('after'),
		}),
	};
}
```

## `useSearchChange`

```tsx
const change = useSearchChange(); // resetKeys: ['after']

<input onChange={(event) => change({ q: event.target.value || null })} />;
<Select onChange={(status) => change({ status })} />;
```

`change(changes)` sets each parameter given a string, deletes each given
`null` or `undefined` (an empty string is a value, so it is kept as `?q=`),
and deletes `resetKeys` in the same step: a new search makes the old cursor
meaningless. It navigates with `replace: true` and `preventScrollReset: true`,
so typing does not fill the history nor jump the page. Pass
`{ resetKeys: ['after', 'page'] }` to drop more.

## `useSameRouteLoading`

```tsx
const reloading = useSameRouteLoading();
return reloading ? <Skeleton /> : <Table rows={rows} />;
```

`true` while a navigation is loading **and** its pathname is the page's own: a
new search of this list. A click on a link to another page stays `false`, so
the list does not flash a skeleton on the way out.

## `usePagedRows`

```tsx
const { rows, next, loading, error, loadMore } = usePagedRows(
	loaderData.page,
	(page) => page.items,
);

<Button disabled={!next || loading} onClick={loadMore}>
	{error ? 'Retry' : 'Load more'}
</Button>;
```

| option | default | |
| --- | --- | --- |
| `cursorParam` | `'after'` | the search parameter carrying the cursor |
| `nextOf` | `page.next` | the cursor after a page, `null` at the end |

- `loadMore()` asks the **same route** for `?<cursorParam>=<next>`, keeping the
  rest of the search, through `useFetcher`: the address bar and the page's
  data do not change. It does nothing at the end or while a page is on its way.
- `rows` is the first page's rows followed by every page loaded after it.
- **It starts over** when `firstPage` is another object, which is what the
  loader gives after a new search or a revalidation. The new first page's rows
  are the ones rendered, with no frame of stale rows, and a page still on its
  way for the old search is dropped.
- **A failure keeps the rows.** When the route answers something that is not a
  page (`null`, or `data({ message }, { status: 503 })`), `error` is `true` and
  `next` is unchanged, so the same button retries. The next `loadMore` clears
  it. Fetcher data that is not a page (no rows, or a `next` that is neither a string nor `null`) sets `error`, like a failed page.

### Another cursor parameter

```ts
// the loader answers { items, cursor } for ?q=&page=<cursor>
const { rows, next, loadMore } = usePagedRows(
	loaderData.page,
	(page) => page.items,
	{ cursorParam: 'page', nextOf: (page) => page.cursor },
);
const change = useSearchChange({ resetKeys: ['page'] });
```

`cursorParam` and `useSearchChange`'s `resetKeys` must name the same
parameter: with the defaults both are `after` (`DEFAULT_CURSOR_PARAM`), and
with another one a search that keeps the old cursor shows the wrong page.

A loader that **throws** on a cursor request is not an `error` here: React
Router sends a fetcher's thrown error to the route's `ErrorBoundary`. To offer
a retry instead, catch in the loader for a request that has the cursor and
answer a value that is not a page.
