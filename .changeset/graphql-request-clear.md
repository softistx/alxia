---
'@alxia/graphql': minor
---

`clearRequestCache(request)` empties what `oncePerRequest` kept for a request, and `freshPerMutation(resolvers)` wraps every function of `Mutation` to call it first: each root mutation field of an operation starts with an empty cache (its sub-fields still share it), so `updateDepartment` then `updateWard { department { name } }` shows the new name, while a query keeps one cache for the whole request. Additive.
