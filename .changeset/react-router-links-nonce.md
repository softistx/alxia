---
'@alxia/react-router': patch
---

Fix the `/document` guide, the README and the `react-router` template: the root passes `<Links nonce={useNonce()} />`. React Router's `<Links>` does not suppress the hydration warning for its development critical-CSS `<style nonce>`, so without the prop React reports a `nonce` mismatch; `<Scripts>` and `<ScrollRestoration>` need nothing. Troubleshooting has an entry for the warning.
