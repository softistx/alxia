# Development

What alxia does for the developer running the app, and what it refuses
before the app ever answers a request. The first three are **dev
helps** — the route table `listen` prints, a hint on a 404 or a 405, a
page for a 500 — and run only in dev. The rest are checks made when the
app is declared, and type errors, in every mode.

## The dev switch

```ts
import { alxia } from '@alxia/core';

const app = alxia({ dev: process.env['APP_DEV'] === '1' });
```

`dev` is on only when `NODE_ENV` is exactly `development`, and fails
closed: `NODE_ENV` unset, `staging`, `prod`, `Production`, `production` and
`test` (what `bun test` sets) all leave it off, so an app started on a VM,
a platform or a container that forgot to set `NODE_ENV` never shows a stack
to the world. Every `bun create @alxia` template's `dev` script sets it:
`NODE_ENV=development bun --hot src/server.ts` (`react-router dev` for the
React Router template), and its `bun start` runs
`NODE_ENV=production bun dist/…`. Write your own `dev` script the same way:

```json
{
	"scripts": {
		"dev": "NODE_ENV=development bun --hot src/server.ts",
		"start": "NODE_ENV=production bun dist/server.js"
	}
}
```

`true` or `false` decides, whatever `NODE_ENV` says; anything else throws
`alxia(): dev must be true or false, not …`. `NODE_ENV` is read when
`alxia()` is called, from `Bun.env`: a bundle `bun build` made, or a binary
`bun build --compile` made, reads it when it runs, not when it was built.
The warning of a middleware given after routes follows the same switch:
the app's `dev`, `alxia({ dev })` included.

| `dev` | on | off |
| --- | --- | --- |
| `listen` | prints the URL and the route table | prints nothing |
| a 404 | `{ "error": "not_found", "hint": "did you mean GET /todos/:id?" }` | `{ "error": "not_found" }` |
| a 405 | `{ "error": "method_not_allowed", "hint": "/todos/1 allows GET, DELETE" }` | `{ "error": "method_not_allowed" }` |
| a 500, to a browser | an HTML page: the error, its stack, the request | `{ "error": "internal" }` |
| a 500, to any other client | `{ "error": "internal", "stack": "Error: …" }` | `{ "error": "internal" }` |

Under `errors: 'problem'` the `hint` and the `stack` are extension members
of the problem, and only in dev. The app that serves the request decides,
as for `errors`: a plugin's own `dev` is not read. Outside dev each of
these costs nothing: a 404 reads one boolean more, a 500 one more too.

A plugin reads the switch of the app serving the request with
`isDev(ctx)`, to help the developer there alone — as `graphql()` serves
GraphiQL and `health()` names its checks only in dev:

```ts
import { alxia, isDev } from '@alxia/core';

const app = alxia().get('/debug', (ctx) =>
	isDev(ctx) ? ctx.reply(200, { route: ctx.route }) : ctx.reply(404, 'not here'),
);
```

## The route table

In dev, `listen` prints where the app listens and every route, in the
order declared — a path's methods together — then the pages:

```text
alxia listening on http://localhost:3000/ (dev)
  GET     /health      cors › logger
  GET     /ready       cors › logger
  GET     /todos       cors › logger › auth → listTodos
  POST    /todos       cors › logger › auth › validate
  DELETE  /todos/:id   cors › logger › auth
  POST    /graphql     cors › logger → graphql
  WS      /chat        cors › logger › auth [ws]
  GET     /assets/*    cors › logger [static]
  GET     /robots.txt  cors › logger [file]
  PAGE    /            [page]
```

Each line is a method, a path, the names of the route's middlewares in the
order they run — the app's `use()`, then the route's own, `validate` and
`responds` among them — and what answers it: the handler's name after `→`
when it has one, `[ws]` for a socket route, `[static]` and `[file]` for
`app.static` and `app.file`, `[page]` for a Bun HTML bundle. A middleware's
name is its function's: `anonymous` for one written inline in the call,
`auth` for one assigned to `const auth`. Every package of alxia names its
own (`cors`, `logger`, `secureHeaders`, `bearer`, …); `derive` and
`decorate` are left out. `@alxia/graphql`'s endpoint is `→ graphql`.

### `onListen`

An app that logs its own way gives `onListen`, called once the server
listens and its signal handlers are in place — in every mode, dev or not —
in place of the table:

```ts
app.listen({
	port: 3000,
	onListen: ({ url, routes, table, dev }) =>
		log.info(dev ? table : `listening on ${url}`, { routes: routes.length }),
});
```

`routes` is the table as data, one `RouteRow` per line — `method`, `path`,
`middlewares`, `handler` — and `table` the text `listen` would print.
Outside dev the table's head reads `alxia listening on <url>`, without
`(dev)`. `dev` is the app's switch. An `onListen` that throws is logged, and the
server keeps listening. The `bun create @alxia` templates print the table
in dev and the URL alone in production this way.

## The 404 hint

In dev, the router's 404 names the closest route the app declares, and its
405 the methods the path allows:

```ts
const app = alxia()
	.get('/todos', ({ reply }) => reply(200, []))
	.get('/todos/:id', ({ params, reply }) => reply(200, find(params.id)))
	.delete('/todos/:id', ({ reply }) => reply(204));

await app.request('/todo/1');
// 404 { "error": "not_found", "hint": "did you mean GET /todos/:id?" }
await app.request('/todos/1', { method: 'POST' });
// 405 { "error": "method_not_allowed", "hint": "/todos/1 allows GET, DELETE" }
```

The closest route is chosen by an edit distance on path segments: a
parameter takes any segment and a wildcard the rest, a word costs the
share of its letters a typo changed (`todo` for `todos`), another word, a
segment too many or too few costs one, and a route of another method a
half more. A route none of whose words is close to one asked is never
suggested: `/orders` on an app with `/todos` gets no hint. Socket routes
are never candidates. The hint is only the router's: an `HttpError(404)` a
handler throws keeps its body.

A hint never reveals a guarded route. The only candidates are the routes
whose chain holds nothing beyond the app-wide middlewares, `derive`s and
`decorate`s — those given to the app's `use()` without a path, which the
request that reached the 404 has just passed. A route behind a group's
middleware, a prefixed plugin's, a `use(path, …)` or a middleware of its
own is never suggested, even in dev, since the request has not passed its
guard. A 405's hint names a path's methods, as its `Allow` does, and comes
only once the request passed the chain of every route at that path, a
group's guard among it:

```ts
const app = alxia()
	.get('/todos', ({ reply }) => reply(200, []))
	.use('/internal', requireAdmin)
	.get('/internal/stats', ({ reply }) => reply(200, stats()));

await app.request('/todo'); // 404, hint: did you mean GET /todos?
await app.request('/internal/stat'); // requireAdmin answers; past it, a 404 with no hint
```

## The dev error page

In dev, a 500 — an error no middleware caught, a reply its schema refused
— is answered with the error rather than hidden. A client whose `Accept`
ranks `text/html` above JSON, a browser's navigation, gets a page:

```text
<!doctype html>
<html lang="en">
<head>
  <title>500: Kaboom</title>
  <style nonce="…">…</style>
</head>
<body><main>
  <h1>Kaboom</h1>                         the error's name
  <p class="message">the db is down</p>   its message
  <dl>                                    the request: method, path, route
    <dt>method</dt><dd>GET</dd>
    <dt>path</dt><dd>/todos/7</dd>
    <dt>route</dt><dd>/todos/:id</dd>
  </dl>
  <pre aria-label="/app/src/todos.ts:20">   the source around the app's first frame,
    19  .get('/todos/:id', () => {           its line marked
  <mark>20    throw new Kaboom('the db is down');</mark>
    21  })
  </pre>
  <ol>                                    the stack, the app's own frames marked
    <li class="app">at handler (/app/src/todos.ts:20:11)</li>
    <li>at serve (/app/node_modules/@alxia/core/dist/index.js:…)</li>
  </ol>
  <footer>alxia in dev: alxia({ dev: false }), or NODE_ENV=production, answers a 500 without it.</footer>
</main></body>
</html>
```

A frame is the app's when its file is under the working directory and not
in `node_modules`. Everything is escaped. The page loads nothing: its one
`<style>` is let in by its own `Content-Security-Policy`, `default-src
'none'; style-src 'nonce-…'`, with a fresh nonce each time, which
`@alxia/secure-headers` keeps, as it keeps any policy a response sets. It
is sent with `Cache-Control: no-store`.

Any other client — `fetch`'s `*/*`, `application/json`, a GraphQL client's
`application/graphql-response+json` — keeps a JSON body, with the stack
beside the error:

```json
{ "error": "internal", "stack": "Kaboom: the db is down\n    at handler (/app/src/todos.ts:20:11)\n    …" }
```

Under `errors: 'problem'`, the problem carries `stack` as an extension
member. The error is still printed with `console.error`. An `HttpError`,
a refusal's 400 or 413 and a client that left (499) keep their answers.

GraphQL errors stay GraphQL's: Yoga answers a resolver's error itself, in
`errors[]` inside a 200 — masked, as its `maskedErrors` says — and the
page never replaces it, a browser's request included.

## A factory given uncalled

`use(cors)` for `use(cors())` throws where it is written:

```text
TypeError: use(): argument 1 looks like a factory (cors): call it, use(cors())
```

Every factory alxia's packages export is marked — `cors`, `compress`,
`secureHeaders`, `logger`, `rateLimit`, `cache`, `telemetry`,
`contextStorage`, `language`, `createI18n`, `session`, `permission`,
`janusErrors`, `bearer`, `idempotency`; and `health`, `apiDocs` and
`redis`, which make a plugin — so the mistake is caught on every form: a
route's middlewares (`GET /x: middleware 1 looks like a factory (logger):
call it, logger() among the route's middlewares`), `ws`, `route(operation,
…)`, `use(path, …)` and `plugin` (`plugin(): argument 1 looks like a
factory (health): call it, plugin(health())`). Mark your own with
`markFactory`:

```ts
import { defineMiddleware, markFactory } from '@alxia/core';

export function audit(options: AuditOptions = {}) {
	return defineMiddleware(async function audit(ctx, next) {
		const response = await next();
		options.write?.(ctx.request.method, response.status);
		return response;
	});
}
markFactory(audit);
// markFactory(myPlugin, 'plugin') for one that makes a plugin
```

Name the middleware it returns, as above, and the route table shows it.
A factory nobody marked is still told on its first request, in the log:
`a middleware (audit) returned function: it looks like a factory given
uncalled, call it: audit()`.

TypeScript refuses it too, on any factory, marked or not: a function that
returns a function is no middleware.

```text
Type 'CorsMiddleware' is not assignable to type '"this looks like a factory given uncalled: call it, as use(cors()) and not use(cors)"'.
```

## More than 8 middlewares: `compose`

A call types 8 middlewares at most, each reading what the ones before it
added. A ninth is one error, on it:

```text
error TS2345: Argument of type 'Middleware<…>' is not assignable to parameter of type '"at most 8 middlewares per route: group them with compose(...)"'.
```

`use(m1, …, m9)` reads the same error, on the ninth.

`compose(...middlewares)` is one middleware standing for several, typed
for any number of them. It goes wherever a middleware does — a route,
`use`, `ws`, `route(operation, …)`, another `compose` — and its members
are spliced into the chain where it stands, so a request runs them as if
each were written there:

```ts
import { alxia, compose, defineMiddleware, validate } from '@alxia/core';

const guarded = compose(session, csrf, auth, tenant, audit);

app.patch('/posts/:id', guarded, canEdit, loadPost, validate({ body: Update }),
	({ user, post, body, reply }) => reply(200, update(user, post, body)));
```

What its members add is passed on, typed; what one reads that no member
before it adds is required where `compose` stands, and a route that does
not give it is refused with the same message as a middleware's
(`` `user` is missing from the context: … ``). A member written inline
reads the base context: one that reads what another adds is written with
`defineMiddleware<Requires>()`. A `validate` or a `responds` among the
members stands where it is on a route; `use` refuses a `compose` that holds
one, naming the member: `use(): argument 1 (compose member 2) is a validate()
or responds(), which belongs to a route`. Every refusal names a member so,
`GET /x: middleware 2 (compose member 1) looks like a factory (logger): …`. Called on its own, a composed middleware throws
`compose() runs among a route's middlewares or in use(), not called on its own`.

## `validate` and `responds` given to `use`

`use(validate({ … }))` and `use(responds({ … }))` are a compile error, as
they throw when declared, and so is a `compose(…)` holding one; the first
line of the error says why:

```text
error TS2345: Argument of type 'Middleware<Empty, Next<Validated<{}>, {}>> & BuiltinMark<"validate">' is not assignable to parameter of type '"validate() belongs to a route, not to use(): give it among the route's middlewares"'.
```

Each declares one route's schemas: give them among that route's
middlewares.
