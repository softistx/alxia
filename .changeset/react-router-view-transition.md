---
'@alxia/create': patch
---

The `react-router` template starts on React 19.3.1 and React Router 8.5.0, and its `app/root.tsx` wraps `<Outlet />` in React's `<ViewTransition>`, as React Router 8.5 recommends in place of its own view transition options, now deprecated: a navigation between two pages animates with no further code.
