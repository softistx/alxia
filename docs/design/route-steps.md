# Routes as a chain of steps

Status: **not adopted** (owner, 2026-10-02). The options form stays. With
no step for the response, a route would lose the check and stripping of its
replies and its response schemas in OpenAPI, and the owner did not want a
response middleware. This note keeps the probe and the reasoning for a later
look at making the options form friendlier.

**Update: the first slice is implemented** on the integration branch, for
`@alxia/core` 0.4.0, with a step for the response after all: `responds`.
Core has `defineMiddleware`, `validate`, `responds`, the forms
`app.<method>(path, options?, ...middlewares, handler)` and
`ws(path, options?, ...middlewares, handlers)`, and the forms of 0.3 — a
list of hooks, a schema before the handler, `defineHook`, `defineWrap` — as
deprecated adapters onto the same chain. Where the implementation decided
differently from the proposal below:

- **One function, `defineMiddleware`, not `step`.** A middleware is
  `(ctx, next) => …` and returns `next(added)`, a reply or a `Response`;
  awaiting `next()` makes it a wrap. Returning anything else is a 500 that
  names the route.
- **`responds({ status: schema })` keeps the response schemas in core.** It
  types the handler's `reply` and checks and strips it, where it is made
  — a status it does not declare is a 500; a reply of a middleware after
  it is checked when its status is declared, and sent as it is otherwise,
  as the route's type says; a reply made before it is not checked. Its schemas reach `RoutesOf` and
  `@alxia/openapi`, which settles decision 2 below.
- **The options object stays, for configuration only:** `bodyLimit` and
  `detail` (`message`, `send` and `detail` on a socket). A schema in it,
  beside middlewares, is a compile error. Decision 1 is settled the other
  way: the options stay, without their schemas.
- **`validate` and `responds` are recognised by the chain**, not run as
  opaque functions: core reads their schemas when the route is declared and
  merges them into `app.routes[i].schema`.
- **The chain is typed by overloads, up to 8 middlewares**; a 9th is a
  compile error. The probe's single variadic signature was not kept.
- **`app.route(operation, …)` is unchanged** in this slice; middlewares on
  it come with `@alxia/openapi`.

The owner asked for routes in Hono's shape: `.post(path, mw1, mw2, handler)`.
A validator would be one of those middlewares, as `@hono/zod-validator` is,
and the handler would simply be the last step of the chain. The schema
stays optional. This note proposes that shape and keeps what alxia has
today: a typed client, the OpenAPI document, and replies refused when their
status is not declared.

This note reopens a decision taken in
[API ergonomics](api-ergonomics.md#decided-not-changing), which was to keep
one form, `get(path, options?, handler)`.

## Today

```ts
app.post(
	'/users',
	{ body: NewUser, response: { 201: User, 409: Taken } },
	({ body, reply }) => reply.created(insert(body)),
);
```

- **The options object is the route's contract.** Core validates with it, and
  types the context and the replies from it. `RoutesOf` records it, and
  `@alxia/client` and `@alxia/openapi` read it.
- **Middleware is not per route.** `derive` and `decorate` apply to every
  route declared after them, and one route has to be put in a `group` to get
  its own.
- **`@alxia/zod` is not a validator middleware.** It adds `zq`, coercions a
  client can type, and the OpenAPI conversion of what only Zod can say.
  Validation itself is done by core, from any Standard Schema.

## Proposal

Revised with the owner's answer on 2026-10-02: **no step for the response**,
since validation is only for the request. One validation step can take
`params`, `query`, `headers`, `cookies` and `body` (a form included) at once,
each optional, and what it validates is typed in every step after it.

```ts
import { alxia, step, validate } from '@alxia/core';

const auth = step(async ({ request }) => ({ user: await userOf(request) }));
const admin = step<{ user: User }>()(({ user, reply }) =>
	user.admin ? {} : reply(403, { error: 'forbidden' }),
);

app.post(
	'/users/:org',
	auth,
	admin,
	validate({ params: OrgParams, body: NewUser }),
	({ params, body, user, reply }) => reply.created(insert(params.org, body, user)),
);

app.get('/health', ({ reply }) => reply.ok('up'));        // no step, no schema
```

### The steps

| Step | Adds to the context | Adds to the contract |
| --- | --- | --- |
| `validate({ params?, query?, headers?, cookies?, body? })` | each one given, validated | its schemas, plus the 400 |
| `step(fn)` | what `fn` returns, or a reply, which stops the chain | the reply's status |
| `step<Needs>()(fn)` | the same, reading `Needs`, which a step before it must add | the same |

- **`validate` comes from core and takes any Standard Schema:** Zod, Valibot
  or ArkType. No `@alxia/zod-validator` is needed, and `zq` still works in
  `validate({ query: z.object({ page: zq.int() }) })`. A route may have more
  than one `validate`, for example `validate({ headers })` before `auth` and
  `validate({ body })` after it. The same target given twice is a compile
  error.
- **`validate` carries its schemas.** Core reads the chain when the route is
  declared and rebuilds the request part of today's `RouteSchema`, so the
  request side of `RoutesOf`, `@alxia/client` and `@alxia/openapi` stays as
  it is. This is the difference from Hono, where a validator is an opaque
  function.
- **The replies are typed by the handler.** What the steps and the handler
  return with `reply(status, body)` is what `RoutesOf` records. The client
  reads each status with the type of its body, as it already does for a
  route without `response`.
- **Steps run in the order they are written.** With `auth` before
  `validate({ body })`, a request without a session is refused before its
  body is read. Today the body is read first.
- **`derive` keeps its meaning,** every route after it. A `step` is the same
  function for one route only.

### What goes with the response schemas

Today `response: { 201: User }` does three things, and without it:

1. **A status not declared no longer fails to compile.** The handler may
   answer any status, and the client is still honest, because it types what
   the handler actually returns.
2. **A reply is no longer checked or stripped at run time.** Today an
   unknown key, a `password` for example, never leaves the server, because
   the reply goes out as its schema's output. Without a schema, that is the
   handler's job.
3. **`@alxia/openapi` no longer has a response schema** to put in the
   document. TypeScript types do not exist at run time, so a route only
   documents its request and a `default` response.

A route's response schemas would then live in `@alxia/openapi`, given as
documentation (`docs({ responses })`, or a `detail` on the route). Core would
neither check them nor type replies from them. That is a decision to make;
see below.

### Typing: probed

A probe in a scratch file, with tsc 6 and alxia's strict options, types the
chain with **one signature, without overloads**. The steps are inferred as a
tuple (`...args: [...Steps, Handler]`), and the handler is typed by what
they add:

- 11 steps typecheck in 0.25 s, with 35,000 instantiations. Hono stops at
  about ten, through overloads.
- `ctx.body` without a `validate({ body })` gives `Property 'body' does not exist on
  type '{ request: Request; } & { user: { id: number; }; }'.`
- A step put before the one it needs gives `Argument of type '(ctx: any) =>
  any' is not assignable to parameter of type '"this step needs user, which
  no step before it adds"'.`
- `validate({ params, body })` types both. Two `validate` steps add up, and
  the same target twice gives `"body is validated twice"`, in 0.22 s and
  35,000 instantiations.

The probe does not yet cover the real `Context`, `RouteEntryOf`, the reply
shortcuts or `ValidSchema`. The first slice starts with that full probe.
That slice stops if the instantiations on core's specs grow by more than a
small factor, or if the errors stop being readable.

### With the OpenAPI codegen

The [OpenAPI codegen note](openapi-codegen.md) planned
`app.route(operation, handler)`. With steps, an operation generated from a
document becomes a list of steps, and `route` takes steps of its own too:

```ts
// generated
export const createUser = {
	method: 'POST',
	path: '/users',
	steps: [validate({ body: zNewUser })],
} as const;

// the app
app.route(createUser, auth, ({ body, reply }) => reply.created(insert(body)));
```

`app.route()` is ready on a local branch with its options form, and it is
**held** until this note is decided, so that it lands in the chosen shape.

## Decisions to make

1. **One form.** I recommend removing the options object and keeping only
   the steps, before 0.1.0, since nothing is published. Keeping both would
   double the signatures and leave two ways to do the same thing.
2. **The response schemas for OpenAPI.** Without them, a document describes
   only its requests. Three ways:
   - documentation only, beside the route, which core does not read;
   - nothing: an app that wants a full contract writes it, in the
     contract-first direction of the [codegen note](openapi-codegen.md);
   - a check of replies in development only.
3. **`route()`.** I recommend `route(operation, ...steps, handler)`, with
   the operation carrying its own steps, as above.

## Cost

- **Core:** the route method's types and the chain read at declaration time.
  It is about the same size as today, since the overloads disappear.
- **Every package's specs, READMEs and guides** use `{ body: X, response: … }`.
  That is 19 packages to move to the steps. The change is mechanical, but
  the docs are large, so it is spread over several PRs, one per group of
  packages, as the docs were.
- **openapi, client, cache, redis and the other plugins:** no change to
  their code. They read `RouteSchema`, which core still builds.

## Slices

1. **Core:** the full type probe, then the steps, `validate` and `step`,
   beside the options object, with specs.
   The options object stays for this slice so that everything else keeps
   building.
2. **Migration:** the specs and docs of every package, in groups.
3. **Core:** remove the options object, and add `route(operation, ...steps,
   handler)`.
4. **OpenAPI codegen** (in nxgt-http): the emitter generates steps.
