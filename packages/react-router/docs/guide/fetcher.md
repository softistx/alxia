# A fetcher's fresh answer

A page that posts JSON through a keyed fetcher (`useJsonFetcher('save')`) often
reacts to each answer once: a toast, a form error. A keyed fetcher outlives its
component, so its data from an earlier visit is still there when the component
mounts again, and a plain `useEffect` on `fetcher.data` reacts to it as if it
were new. `@alxia/react-router/fetcher` holds the hook that tells them apart
(`useFetcherAnswer`, which reads the fetcher structurally) and the one that
loads a resource route for what the user types (`useDebouncedFetcher`, below).
`react` is its only import, plus `react-router` for `useDebouncedFetcher`, and
both render on the server.

```tsx
import { useJsonFetcher } from '@alxia/react-router/errors';
import { useFetcherAnswer } from '@alxia/react-router/fetcher';

export function SaveForm() {
	const { fetcher, post } = useJsonFetcher<typeof action>('save');
	const answer = useFetcherAnswer(fetcher, (result) => toast(result.message));
	return (
		<>
			<button onClick={() => post({ name: 'Ana' })}>Save</button>
			{answer ? <p>{answer.message}</p> : null}
		</>
	);
}
```

## `useFetcherAnswer(fetcher, onAnswer?)`

- `onAnswer` is called once for each answer that arrives while
  `fetcher.state` is `'idle'` and is another object than the last one seen.
- The data the fetcher holds when the component mounts counts as seen, so
  remounting does not replay it.
- The handler is kept in a ref: a new function each render never fires it
  again, and it always runs the latest one.
- It returns the latest answer handed over (`undefined` until one arrives),
  typed as the action's data, for a screen that reads it as well.
- The comparison is by identity: two answers equal in value but returned as
  two objects are two answers, and so is a reloading `fetcher.load`, which
  hands a new object each time. An answer that comes back as the object seen
  before (A, B, then A again) is a new answer once B was seen.

## Typeahead: `useDebouncedFetcher(value, to, options?)`

A search box, a suggestion list or a preview loads a resource route for what
the user types. The pattern is always the same: wait for a pause after the last
keystroke, ask from a minimum length, never act on an answer for older words,
keep the previous answer on screen while the next one loads, offer a retry.

```tsx
import { useDebouncedFetcher } from '@alxia/react-router/fetcher';

export function Suggestions({ typed }: { typed: string }) {
	const { data, stale, state, retry } = useDebouncedFetcher<SuggestAnswer>(
		typed,
		(q) => `/suggest?${new URLSearchParams({ q })}`,
		{ minLength: 2, delayMs: 250 },
	);
	if (state === 'idle') return null;
	return (
		<div aria-busy={state !== 'done'} style={{ opacity: stale ? 0.5 : 1 }}>
			{data ? <List items={data.items} /> : <Spinner />}
			{data?.failed ? <button onClick={retry}>Try again</button> : null}
		</div>
	);
}
```

- `value` is the text typed; it is trimmed, and nothing is asked below
  `minLength` (default 1). `to` is the route's URL, or a function of the
  trimmed value that builds it (a plain string is loaded as it is, the value
  only triggering it).
- After `delayMs` (default 250) without a change, one `fetcher.load` is made;
  a newer load cancels the previous one.
- `data` is the route's answer for the value as it stands. While a newer value
  waits or loads it is the previous answer and `stale` is `true`; an answer
  for an older value is never returned as current. It is `undefined` before
  the first answer and again once the hook is `idle`.
- `state` is `'idle'` (disabled or too short), `'waiting'` (the pause is
  running), `'loading'` or `'done'`.
- `retry()` asks again for the value as it stands, without the pause.
- A refusal the route answers as data (`{ failed: true }`) is `data` like any
  answer. A route that throws goes to the route's error boundary, as with any
  fetcher.
- `enabled: false` asks nothing and forgets the previous answer (a closed
  dialog); `key` shares the fetcher with another component.
