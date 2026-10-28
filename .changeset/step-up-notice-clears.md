---
'@alxia/react-router': patch
---

`useStepUpReplay`'s `confirmedNotice` now clears as soon as `action` becomes another value (the user posted a new action), instead of lingering until that action's answer or `cancel()`. Behaviour change, on by default: a host that passes the same `action` reference for different posts must pass a new object for each. Documented that a `replay()` that posts nothing leaves the dialog confirming, so the host must call `cancel()`.
