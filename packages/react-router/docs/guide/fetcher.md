# A fetcher's fresh answer

A page that posts JSON through a keyed fetcher (`useJsonFetcher('save')`) often
reacts to each answer once: a toast, a form error. A keyed fetcher outlives its
component, so its data from an earlier visit is still there when the component
mounts again, and a plain `useEffect` on `fetcher.data` reacts to it as if it
were new. `@alxia/react-router/fetcher` holds the hook that tells them apart.
`react` is its only import (the fetcher is read structurally), and it renders
on the server.

```tsx
import { useJsonFetcher } from '@alxia/react-router/errors';
import { useFetcherAnswer } from '@alxia/react-router/fetcher';

export function SaveForm() {
	const { fetcher, post } = useJsonFetcher<typeof action>('save');
	const answer = useFetcherAnswer(fetcher, (result) => {
		if (result.ok) toast('Saved');
	});
	return <button onClick={() => post({ name: 'Ana' })}>Save</button>;
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
- Two answers equal in value but returned as two objects are two answers.
