---
'@alxia/react-router': minor
---

`stepUpSteps` now asks `wording(error, language)` for a refusal whose code is in `codes.challengeOver` (an unknown or expired challenge) before falling back to `spent`, so an app can show the API's own words for a challenge that is gone and keep `spent` for the tries running out. Apps that pass no `wording`, or one that returns `undefined` there, behave as before. Behaviour change: an app whose `wording` already returns a string for these codes (the default `STEP_UP_OVER` list, or its own `codes.challengeOver`) now shows that text instead of `spent`; return `undefined` for them to keep `spent`.

