---
'@alxia/react-router': minor
---

Add `useStepUpReplay` and `useStepUp` to `@alxia/react-router/session/react`: open a step-up dialog when an action's answer carries `stepUp`, post the `request-step-up` and `confirm-step-up` intents through the host's own typed `post`s, and send the refused action again once the session is confirmed (not when it carries a one-time code the step-up just spent: `confirmedNotice` then says to type a new one). `stepUpSteps` gains `route(run, { request, language })`, the whole action of one resource route any page can post the step-up intents to.
