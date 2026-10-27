---
'@alxia/graphql': minor
---

`oncePerRequest(request, key, load)` loads a value at most once per request object and key, and releases it with the object (a `WeakMap`): the category of twenty items, or one DataLoader per request and key, `oncePerRequest(context, 'categories', () => new DataLoader(load))`, with no dependency added. A `load` that throws or returns a rejected promise is not kept. Additive.
