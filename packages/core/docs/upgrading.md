# Upgrading to the next release

This page lists what the next release changes for an app built on
`@alxia/core`: what changed, the code before and after, and whether it can
break yours. The next release is `@alxia/core` 0.3.0, with `@alxia/openapi`
0.3.0 and 0.2.0 of `@alxia/logger`, `@alxia/telemetry`,
`@alxia/secure-headers`, `@alxia/react-router` and `@alxia/openapi-routes`.

**Upgrade every `@alxia/*` package together.** Each one names `@alxia/core`
as a peer by a `^0.2` range, which 0.3.0 is outside of; their next releases
move the range.

```sh
bun add @alxia/core@latest @alxia/client@latest @alxia/openapi@latest # and every other @alxia/* you use
```

| Change | Package | Can it break your code |
| --- | --- | --- |
| [The request's cookies on every hook](#the-requests-cookies-on-every-hook) | core | yes, in three narrow cases |
| [Route paths checked by the types](#route-paths-checked-by-the-types) | core | yes: a path the app refused at startup, and a wrapper generic in its path |
| [`onRefusal(kind, …)`](#onrefusalkind-) | core, openapi | no; one compile error reads differently |
| [`matchesSpec`, the new name of `exactly`](#matchesspec-the-new-name-of-exactly) | openapi-routes | no; `exactly` is deprecated |
| [Streamed bodies timed to their last byte](#streamed-bodies-timed-to-their-last-byte) | logger, telemetry | dashboards and tests that read a streamed request's entry or span |
| [A CSP nonce per request](#a-csp-nonce-per-request) | secure-headers, react-router | no; opt-in |

## The request's cookies on every hook

**What changed.** `cookies` is on `BaseContext`: every route hook —
`derive`, `wrap`, `onError`, `onRefusal` — reads the request's cookies as
`ctx.cookies`, a `Readonly<Record<string, string>>` parsed from the
`Cookie` header on first read. A route's `cookies` schema still gives its
handler the validated values.

```ts
// before: parsing the header yourself
.derive(({ request }) => {
	const sid = /(?:^|;\s*)sid=([^;]*)/.exec(request.headers.get('cookie') ?? '')?.[1];
	return { user: sessions.get(sid ?? '') ?? null };
})

// after
.derive(({ cookies }) => ({ user: sessions.get(cookies['sid'] ?? '') ?? null }))
```

`set.cookies` is now typed `ResponseCookies`, Bun's `CookieMap` whose `get`
and `has` say in their documentation that they read the **response's**
cookies. Its behaviour is the same: `set.cookies.get('sid')` in a hook was
always `null`, and still is. Read `ctx.cookies` instead
([Troubleshooting](troubleshooting.md#setcookiesget-returns-null-in-a-hook)).

**Can it break your code.** In three cases:

- **An object literal typed `BaseContext`**, such as a fake context in a
  test, must now give `cookies`:

  ```text
  error TS2741: Property 'cookies' is missing in type '{ … }' but required in type 'BaseContext'.
  ```

  ```diff
   const ctx: BaseContext = {
   	…
   	pathParams: { id: '1' },
  +	cookies: {},
   };
  ```

- **A handler's context passed to a helper typed `BaseContext`**, on a
  route whose `cookies` schema outputs anything but strings:

  ```text
  error TS2345: Argument of type 'Context<…>' is not assignable to parameter of type 'BaseContext'.
    Types of property 'cookies' are incompatible.
      Type '{ visits: number; }' is not assignable to type 'Readonly<Record<string, string>>'.
  ```

  Pass the helper the fields it reads, or type its parameter without
  `cookies`:

  ```ts
  import type { BaseContext } from '@alxia/core';

  const who = (ctx: Omit<BaseContext, 'cookies'>) => ctx.route;
  ```

- **A `derive` that returns `cookies`** now reaches a handler with no
  `cookies` schema; before, the handler saw the parsed header instead. A
  route's `cookies` schema now validates the map the `derive` returned, not
  the header. Rename the key if the handler expects the header's values.

See [Hooks: reading the request's cookies](guide/hooks.md#reading-the-requests-cookies).

## Route paths checked by the types

**What changed.** A route path written as a literal that the app would
refuse when the route is declared no longer compiles. Before, it compiled,
its params were inferred wrongly, and the app threw a `TypeError` at
startup. The check covers `get` and the other methods, `route`, `ws`,
`page`, `file` and `static`, under the app's prefix and the group's.

```ts
// before: compiled, params typed { 30: string }, threw at startup
app.get('/at/10:30', handler);
```

```text
error TS2345: Argument of type '"/at/10:30"' is not assignable to parameter of type '"Invalid path: \"/at/10:30\": \":\" may only start a segment, as a parameter"'.
```

```ts
// after: a parameter is a whole segment
app.get('/at/:time', handler);
```

The text after `Invalid path:` is the `TypeError` the app would throw; each
is listed in [Troubleshooting](troubleshooting.md#argument-of-type--is-not-assignable-to-parameter-of-type-invalid-path-).
A path typed `string`, or holding a `` `${string}` ``, is left to the
runtime check, as before.

**Can it break your code.** Yes, for a function that forwards a path
generic in `P` to a route method:

```text
error TS2345: Argument of type 'P' is not assignable to parameter of type 'PathAt<"", P, P>'.
```

Type the parameter with the check of the method it forwards to. The path is
then checked where the function is called:

```ts
import { alxia, type PathAt, type RoutePath, type StaticPath } from '@alxia/core';

// before: export function routedAt<const P extends RoutePath>(path: P)
export function routedAt<const P extends RoutePath>(path: PathAt<'', P>) {
	return alxia().get(path, ({ reply }) => reply(200, 'x'));
}
export function servedAt<const P extends RoutePath>(path: PathAt<'', P, StaticPath<P>>) {
	return alxia().static(path, './public');
}
```

New exports: `PathAt`, `CheckedPath` and `StaticPath`.

## `onRefusal(kind, …)`

**What changed.** `onRefusal` takes a kind first, `'validation'` or
`'body_limit'`, for a hook that answers that kind alone. It reads its
refusal narrowed, and its replies replace that kind's default only, in the
route's type, the client and the OpenAPI document. `onRefusal(hook)` and
`onRefusal(schema, hook)` are unchanged.

```ts
// before: one hook, checking the kind
.onRefusal((refusal) =>
	refusal.kind === 'validation'
		? problem({ status: 422, detail: `the ${refusal.part} is invalid` })
		: undefined,
)

// after: a hook of one kind; body_limit falls back to the general hook, then the 413
.onRefusal('validation', (refusal) => problem({ status: 422, detail: `the ${refusal.part} is invalid` }))
```

**Can it break your code.** No. One compile error reads differently:
`onRefusal` now has four forms, so a schema mistake such as a 5xx status is
reported as no overload matching, with the old message nested under it:

```text
error TS2769: No overload matches this call.
  Overload 1 of 4, '(schema: RefusalSchema<RefusalResponses>, hook: …)', gave the following error.
    Object literal may only specify known properties, and '500' does not exist in type 'RefusalResponses'.
```

A kind typed as a union, or as a generic parameter, is refused at compile
time: write one call per kind
([Troubleshooting](troubleshooting.md#argument-of-type-validation--body_limit-is-not-assignable-to-parameter-of-type-never)).
`@alxia/openapi` 0.3.0 documents each kind's statuses on the routes that
kind may refuse. See [One hook per kind](guide/hooks.md#one-hook-per-kind).

New exports: `RefusalKind`, `RefusalOfKind`, `RefusalHandlersByKind`,
`RefusalMethod`, and the marks `RefusingKind`, `KindFallsBack`,
`KindRefusalsOf`, `KindOutcome`, `OneKind`.

## `matchesSpec`, the new name of `exactly`

**What changed.** In `@alxia/openapi-routes`, `exactly(app, operations)` is
renamed `matchesSpec`, and `ExactlyOptions` `MatchesSpecOptions`.

```ts
// before
import { exactly } from '@alxia/openapi-routes';
exactly(app, operations);

// after
import { matchesSpec } from '@alxia/openapi-routes';
matchesSpec(app, operations);
```

**Can it break your code.** No: `exactly` and `ExactlyOptions` still work,
deprecated, and their messages still start with `exactly():`. See
[`@alxia/openapi-routes`](https://github.com/softistx/alxia/blob/develop/packages/openapi-routes/docs/guide.md#matchesspec).

## Streamed bodies timed to their last byte

**What changed.** A streamed body — a page rendered as it goes, an event
stream, a `ReadableStream` reply — is now timed until it has been sent:

- `@alxia/logger` writes its entry once the body has ended, not when the
  handler returned. `duration` runs to the last byte, and two fields are
  new: `timeToHeaders`, the time to the response, and `outcome`,
  `completed`, `aborted` (logged at least `warn`) or `errored` (`error`).
- `@alxia/telemetry` keeps the server span open until the body has been
  sent. A body that fails midway makes the span an error; a client that
  leaves adds an `http.response.aborted` event.

```ts
// an event stream whose client left after five seconds
// before: {"level":"info","message":"GET /ticks 200","duration":0.6,…}
// after:  {"level":"warn","message":"GET /ticks 200 aborted","duration":5004.1,"timeToHeaders":0.62,"outcome":"aborted",…}
```

A response with no body, or with a `Content-Length` header (every reply of
a string, JSON, a buffer or a file has one), is logged and traced as
before. A raw `Response` without that header is now timed as a stream.

**Can it break your code.** A dashboard or alert on the `duration` of
streamed routes now sees the whole stream. A test that reads the entry or
the span of a streamed route right after `app.request` must read or cancel
the body first:

```ts
const response = await app.request('/ticks');
await response.body?.cancel(); // or `await response.text()` for a body that ends
```

See [`@alxia/logger`: a streamed body](https://github.com/softistx/alxia/blob/develop/packages/logger/docs/guide.md#a-streamed-body)
and [`@alxia/telemetry`: a streamed body](https://github.com/softistx/alxia/blob/develop/packages/telemetry/docs/guide.md#a-streamed-body).

## A CSP nonce per request

**What changed.** `secureHeaders({ nonce: true })` makes a fresh nonce for
each request, adds it to the policy's `script-src` and `script-src-elem`
(or wherever the policy names the exported `NONCE`), and gives the routes
declared after it `ctx.nonce`. In a React Router app, `nonceOf(loadContext)`
from `@alxia/react-router` reads it in `entry.server.tsx`:

```ts
import { alxia } from '@alxia/core';
import { secureHeaders } from '@alxia/secure-headers';

const app = alxia()
	.use(secureHeaders({ nonce: true, contentSecurityPolicy: "default-src 'self'; script-src 'self'" }))
	.get('/', ({ nonce, reply }) =>
		reply(200, `<script nonce="${nonce}">document.title = 'ready'</script>`, {
			headers: { 'content-type': 'text/html; charset=utf-8' },
		}),
	);
```

```diff
 // app/entry.server.tsx
+import { nonceOf } from "@alxia/react-router";
 …
-      <ServerRouter context={routerContext} url={request.url} />,
+      <ServerRouter context={routerContext} url={request.url} nonce={nonceOf(loadContext)} />,
       {
+        nonce: nonceOf(loadContext),
```

**Can it break your code.** No: without `nonce: true`, every header is what
it was. With it, a policy with nowhere to put the nonce,
`contentSecurityPolicy: false`, or `NONCE` without `nonce: true` are
refused at startup. See
[`@alxia/secure-headers`: a nonce per request](https://github.com/softistx/alxia/blob/develop/packages/secure-headers/docs/guide.md#a-nonce-per-request)
and [`@alxia/react-router`: a CSP nonce](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/guide.md#a-csp-nonce).

## From 0.2.0 or earlier

`@alxia/core` 0.2.1 already changed one thing an app may see: **a client
that hangs up mid-request** is no longer logged and answered 500. Nothing
is printed, no `onError` hook runs, and the request gets a bodyless `499`
that only `onResponse` hooks — a logger's — see.

```ts
// before: a 500 and a console.error for a client that left during the body read
// after: a 499, no log, no onError
app.onResponse((response, { request }) => {
	if (response.status === 499) console.info('client left', request.url);
});
```

It cannot break code, but a log or an alert counting 500s sees fewer. An
error the app throws after the client left is still logged and answered
500. See [Replies: errors](guide/replies.md#errors).

## Other packages

Every other `@alxia/*` package gets a patch release whose only change is
its peer range on `@alxia/core`; its own docs have nothing new.

- `@alxia/openapi` 0.3.0 — each `onRefusal` kind's statuses on the routes that kind may refuse: [its docs](https://github.com/softistx/alxia/blob/develop/packages/openapi/docs/README.md).
- `@alxia/logger` 0.2.0, `@alxia/telemetry` 0.2.0 — [above](#streamed-bodies-timed-to-their-last-byte).
- `@alxia/secure-headers` 0.2.0, `@alxia/react-router` 0.2.0 — [above](#a-csp-nonce-per-request).
- `@alxia/openapi-routes` 0.2.0 — [above](#matchesspec-the-new-name-of-exactly).
