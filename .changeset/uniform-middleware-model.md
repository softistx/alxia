---
"@alxia/core": minor
---

One middleware model: `defineMiddleware`, `validate` and `responds`, given to a route after its path or its options: `app.post(path, { bodyLimit }, auth, validate({ body }), responds({ 201: Post }), handler)`. A middleware is `(ctx, next) => …`: `next(added)` passes `added` on, typed, to what follows and resolves to the response of the rest, so awaiting it wraps them; a reply or a `Response` it returns ends the request. The route threads the context through up to 8 middlewares, and `validate` stands where it is given: an `auth` before it answers 401 before the body is read. `ws(path, options?, ...middlewares, handlers)` takes the same. The forms of 0.3 — a list of hooks, a schema before the handler, `defineHook` and `defineWrap` — keep working, deprecated, as adapters onto the same chain.
