---
'@alxia/react-router': minor
---

`@alxia/react-router/lists`: the hooks of a list screen whose state is the URL. `useSearchChange({ resetKeys? })` returns `(changes) => void` that sets or deletes search parameters and drops the cursor (`after` by default), replacing the history entry and keeping the scroll position. `useSameRouteLoading()` is `true` while another search of the current pathname is loading. `usePagedRows(firstPage, rowsOf, { cursorParam?, nextOf? })` returns `{ rows, next, loading, error, loadMore }`: it appends the pages the same route answers to `?after=<next>` through `useFetcher`, starts over when the loader gives a new first page, and keeps the rows and sets `error` when a page fails. It imports `react` and `react-router` only. Additive.
