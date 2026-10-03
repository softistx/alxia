---
"@alxia/core": patch
---

A client that hangs up mid-request is no longer logged with `console.error` and answered 500: nothing is printed, no `onError` hook runs, and `onResponse` hooks see a 499. An error the app throws after the client left is still logged and answered 500.
