---
'@alxia/react-router': patch
---

`stepUpSteps` takes a `signInFlow` typed with a caller context (`signInFlow<Lang, Caller>`) without a cast: `StepUpStepsOptions` gains a second type parameter `C`, `undefined` by default, so a flow with no context is unchanged. Fixes #351.
