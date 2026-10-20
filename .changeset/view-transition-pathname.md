---
'@alxia/create': patch
---

The `react-router` template's `<ViewTransition>` animates a navigation to another pathname only: its `update` is `"none"` otherwise, so a fetcher's answer or a search writing `?q=` updates the page in place instead of holding it for an animation and dropping the keys typed meanwhile. `app/app.css` gains a `prefers-reduced-motion` rule that turns view transition animations off.
