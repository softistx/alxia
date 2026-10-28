# Links through React Router

A UI library that renders its links through a component of its own (a
`LinkComponentProvider`) hands that component an `href` and spreads every other
prop onto the anchor. React Router's `Link` takes `to`, so an app adapts it.
`@alxia/react-router/link` exports that adapter. `react` and `react-router` are
its only imports, and it renders on the server.

```tsx
// app/root.tsx
import { RouterLink } from '@alxia/react-router/link';

export default function App() {
	return (
		<LinkComponentProvider component={RouterLink}>
			<Outlet />
		</LinkComponentProvider>
	);
}
```

## What it does

- `href` (or `to`, React Router's own name, never both) is the destination: a
  string or a `To` object.
- An external target (`https://…`, `mailto:`, `//host`) renders a plain anchor with that `href`; React Router's `Link` already handles it.
- `className`, `children`, `ref`, `aria-*`, `target` and every other anchor prop
  reach the `<a>`.
- `Link`'s own props (`replace`, `prefetch`, `reloadDocument`, `state`, ...) still
  apply, so a link can opt out of client-side navigation.

`RouterLinkProps` is the type of its props, for a wrapper of your own.
