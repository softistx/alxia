# Troubleshooting

Each entry is headed by the text you see: a TypeScript error on a call, or
an exception a call, a stream or a socket throws. Problems that show no
message are under [Traps](#traps), by symptom.

**Types**

- [`Argument of type '"/nope"' is not assignable to parameter of type 'PathsFor<…>'`](#argument-of-type-nope-is-not-assignable-to-parameter-of-type-pathsfor)
- [`Expected 2 arguments, but got 1.`](#expected-2-arguments-but-got-1)
- [`Property 'name' is missing in type '{}' but required in type '{ name: string; }'`](#property-name-is-missing-in-type--but-required-in-type--name-string-)
- [`Property 'headers' is missing in type '{ body: … }' but required in type '{ readonly headers: …; readonly body: … }'`](#property-headers-is-missing-in-type--body---but-required-in-type--readonly-headers--readonly-body--)
- [`Object literal may only specify known properties, and 'query' does not exist in type '{ readonly params: …; } & CallOptions'`](#object-literal-may-only-specify-known-properties-and-query-does-not-exist-in-type--readonly-params----calloptions)
- [`Property 'put' does not exist on type 'Client<…>'`](#property-put-does-not-exist-on-type-client)
- [`Property 'ws' does not exist on type 'Client<…>'`](#property-ws-does-not-exist-on-type-client)
- [`Property 'name' does not exist on type 'ValidationErrorBody | InternalErrorBody | …'`](#property-name-does-not-exist-on-type-validationerrorbody--internalerrorbody--)
- [`Property 'getTime' does not exist on type 'string'`](#property-gettime-does-not-exist-on-type-string)
- [`Property 'text' does not exist on type 'ValidationErrorBody | { … }'`](#property-text-does-not-exist-on-type-validationerrorbody----)
- [`Argument of type '{}' is not assignable to parameter of type 'Target | AppLike'`](#argument-of-type--is-not-assignable-to-parameter-of-type-target--applike)

**Runtime**

- [`TypeError: client(): give it a URL, or an app with a fetch`](#typeerror-client-give-it-a-url-or-an-app-with-a-fetch)
- [`TypeError: /…: the parameter :… is missing`](#typeerror--the-parameter--is-missing)
- [`TypeError: client(app).ws(): a socket needs a server. Give the client its URL.`](#typeerror-clientappws-a-socket-needs-a-server-give-the-client-its-url)
- [`TypeError: ws(…): outside Bun, a WebSocket cannot send headers or cookies; …`](#typeerror-ws-outside-bun-a-websocket-cannot-send-headers-or-cookies-a-browser-sends-its-own-cookies-for-the-sockets-host-and-anything-else-goes-in-the-query)
- [`TypeError: Invalid URL`](#typeerror-invalid-url)
- [`TypeError: Unable to connect. Is the computer able to access the url?`](#typeerror-unable-to-connect-is-the-computer-able-to-access-the-url)
- [`AbortError: The operation was aborted.`](#aborterror-the-operation-was-aborted)
- [`TimeoutError: The operation timed out.`](#timeouterror-the-operation-timed-out)
- [`SyntaxError: JSON Parse error: Unexpected identifier "…"` on a call](#syntaxerror-json-parse-error-unexpected-identifier--on-a-call)
- [`SyntaxError: JSON Parse error: Unexpected identifier "…"` in an event stream](#syntaxerror-json-parse-error-unexpected-identifier--in-an-event-stream)
- [`Error: The socket to ws://…/… failed`](#error-the-socket-to-ws-failed)
- [`TypeError: Body already used`](#typeerror-body-already-used)

**Traps**

- [A status the type does not list](#a-status-the-type-does-not-list)
- [A socket message never arrives](#a-socket-message-never-arrives)
- [Cookies are not sent from a browser](#cookies-are-not-sent-from-a-browser)
- [The browser bundle holds the server's code](#the-browser-bundle-holds-the-servers-code)
- [A query or param field accepts anything](#a-query-or-param-field-accepts-anything)

## Types

These are what `tsc` prints. The client is typed from the app's routes, so
a call the server would refuse, or a field a status does not carry, is a
compile error. The long type names are cut here with `…`.

### `Argument of type '"/nope"' is not assignable to parameter of type 'PathsFor<…>'`

**When:** calling a path the app does not declare for that method.

```text
error TS2345: Argument of type '"/nope"' is not assignable to parameter of type 'PathsFor<Empty & RouteEntryOf<"GET", "/users/:id", …> & …, "GET">'.
```

**Why:** the first argument is a route's path **as declared**, with its
parameters: `'/users/:id'`, not `'/users/1'`. Only the paths that answer the
method compile, prefixes and groups included.

**Fix:** pass the declared path, and the values in `params`:

```ts
await api.get('/users/:id', { params: { id: 1 } });
```

### `Expected 2 arguments, but got 1.`

**When:** calling a route that needs something — a path parameter, a
required header or body — with no options; or calling a path with a method
it does not answer (`api.post('/health')` when `/health` is `GET` only).

```text
error TS2554: Expected 2 arguments, but got 1.
```

**Why:** the options are optional only when the route needs nothing.

**Fix:** pass what the route reads, or the method it answers:

```ts
await api.get('/users/:id', { params: { id: 1 } });
await api.get('/health');
```

### `Property 'name' is missing in type '{}' but required in type '{ name: string; }'`

**When:** a `body`, `query` or `headers` lacks a field its schema
requires.

```text
error TS2741: Property 'name' is missing in type '{}' but required in type '{ name: string; }'.
```

**Why:** each part is typed by the input of the route's schema.

**Fix:** send the field:

```ts
await api.post('/users', { headers: { 'x-tenant': 'acme' }, body: { name: 'Grace' } });
```

### `Property 'headers' is missing in type '{ body: … }' but required in type '{ readonly headers: …; readonly body: … }'`

**When:** a route declares a `headers` schema with a required header, and
the call sends none.

```text
error TS2345: Argument of type '{ body: { name: string; }; }' is not assignable to parameter of type '{ readonly headers: { 'x-tenant': string; }; readonly body: { name: string; }; } & CallOptions'.
  Property 'headers' is missing in type '{ body: { name: string; }; }' but required in type '{ readonly headers: { 'x-tenant': string; }; readonly body: { name: string; }; }'.
```

**Why:** a header the route's schema requires is part of the call's type.
`init.headers` and `ClientOptions.headers` are untyped, so they do not
count.

**Fix:** pass it in the typed `headers`:

```ts
await api.post('/users', { headers: { 'x-tenant': 'acme' }, body: { name: 'Grace' } });
```

### `Object literal may only specify known properties, and 'query' does not exist in type '{ readonly params: …; } & CallOptions'`

**When:** passing `query`, `headers`, `cookies` or `body` to a route that
declares no schema for it.

```text
error TS2353: Object literal may only specify known properties, and 'query' does not exist in type '{ readonly params: { readonly id: string | number; }; } & CallOptions'.
```

**Why:** the server would not read it. A part the route has no schema for
is not in the call's type.

**Fix:** declare the schema on the route, or, for an untyped header the
server reads by hand, send it through `init`:

```ts
await api.get('/users/:id', { params: { id: 1 }, init: { headers: { 'x-trace': '1' } } });
```

### `Property 'put' does not exist on type 'Client<…>'`

**When:** using a method — `put`, `patch`, `delete`… — for which the app
has no route.

```text
error TS2339: Property 'put' does not exist on type 'Client<Alxia<Empty, Empty & RouteEntryOf<"GET", "/users/:id", …> & …>>'.
```

**Why:** the client has a method only for the HTTP methods its app answers.

**Fix:** declare the route on the server; or, if it is there, check that
the client is typed with that app: `client<App>(url)` with
`type App = typeof app`, the app as finally built, after its last `.put()`.

### `Property 'ws' does not exist on type 'Client<…>'`

**When:** calling `api.ws()` on an app that declares no socket.

```text
error TS2339: Property 'ws' does not exist on type 'Client<Alxia<Empty, Empty & RouteEntryOf<"GET", "/health", Empty, Reply<200, "ok">, never>, "", never>>'.
```

**Why:** `ws` exists only when a `.ws()` route does.

**Fix:** type the client with the app that declares the socket, as for
[`put`](#property-put-does-not-exist-on-type-client).

### `Property 'name' does not exist on type 'ValidationErrorBody | InternalErrorBody | …'`

**When:** reading `result.data` before checking `status` or `ok`.

```text
error TS2339: Property 'name' does not exist on type 'ValidationErrorBody | InternalErrorBody | { id: number; name: string; createdAt: string; } | { error: "not_found"; }'.
  Property 'name' does not exist on type 'ValidationErrorBody'.
```

**Why:** `data` is one type per status, and every route may answer more
than its success: its 500 always, its 400 when it validates.

**Fix:** narrow first ([Reading results](guide/results.md#narrowing)):

```ts
const result = await api.get('/users/:id', { params: { id: 1 } });
if (result.status === 200) result.data.name;
```

### `Property 'getTime' does not exist on type 'string'`

**When:** using a field the server's schema declares as a `Date` as a
`Date`.

```text
error TS2339: Property 'getTime' does not exist on type 'string'.
```

**Why:** a `Date` crosses the wire as JSON, an ISO 8601 string, and `data`
is typed as it arrives, not as the server held it.

**Fix:** parse it where you need a date:

```ts
if (result.status === 200) new Date(result.data.createdAt).getTime();
```

### `Property 'text' does not exist on type 'ValidationErrorBody | { … }'`

**When:** reading a field of a socket's message in `on` or `for await`,
on a route with a `message` schema.

```text
error TS2339: Property 'text' does not exist on type 'ValidationErrorBody | { room: string; text: string; }'.
  Property 'text' does not exist on type 'ValidationErrorBody'.
```

**Why:** when the server refuses a message the client sent, it answers on
the same socket with a `ValidationErrorBody`. What a socket receives
includes it.

**Fix:** narrow it out ([Events and sockets](guide/events-and-sockets.md#what-a-socket-receives)):

```ts
socket.on((message) => {
	if ('error' in message) return console.warn(message.issues);
	console.log(message.text);
});
```

### `Argument of type '{}' is not assignable to parameter of type 'Target | AppLike'`

**When:** `client()` is given something that is neither a URL nor an app:
a config object, an environment variable read as `string | undefined`.

```text
error TS2345: Argument of type '{}' is not assignable to parameter of type 'Target | AppLike'.
```

**Why:** the target is a base URL (`string` or `URL`), the app, or
anything with a `fetch(request)`.

**Fix:**

```ts
const api = client<App>(Bun.env['API_URL'] ?? 'http://localhost:3000');
```

## Runtime

### `TypeError: client(): give it a URL, or an app with a fetch`

**When:** creating the client, with a target that is neither a `string`, a
`URL`, nor an object with a `fetch` function. The types refuse it, so this
comes from JavaScript, or through a cast.

**Why:** the client has nowhere to send its calls.

**Fix:** a base URL, or the app:

```ts
const api = client<App>('http://localhost:3000');
const inProcess = client(app);
```

### `TypeError: /…: the parameter :… is missing`

For example `TypeError: /users/:id: the parameter :id is missing`.

**When:** a call, or `fillPath`, is given no value for one of the path's
parameters. The types require them, so this comes from a cast, an
`undefined` that got past them, or `fillPath` called directly.

**Why:** the client will not send a request to `/users/undefined`.

**Fix:** pass every parameter the path declares:

```ts
await api.get('/users/:id', { params: { id: user.id } });
```

### `TypeError: client(app).ws(): a socket needs a server. Give the client its URL.`

**When:** calling `ws()` on a client created from the app itself.

**Why:** in process, the client calls `app.fetch`; a WebSocket needs a
real connection to upgrade.

**Fix:** listen, and give the client the server's URL
([Testing](guide/testing.md#sockets)):

```ts
const server = app.listen({ port: 0 });
const socket = client<typeof app>(server.url).ws('/echo/:room', { params: { room: 'lobby' } });
```

### `TypeError: ws(…): outside Bun, a WebSocket cannot send headers or cookies; a browser sends its own cookies for the socket's host, and anything else goes in the query`

For example `TypeError: ws(/whoami): outside Bun, a WebSocket cannot send headers or cookies; …`,
with the socket's path, params filled in.

**When:** calling `api.ws()` outside Bun — in a browser — with typed
`headers` or `cookies`. The same call works under Bun. Node and Deno are
treated the same way: the client sends headers only where it has been
tested to.

**Why:** a browser's `WebSocket` cannot send request headers, and the route
reads them, so the server would refuse the upgrade. The client throws
rather than open a socket that fails. Under Bun, whose `WebSocket` takes
headers, they go with the upgrade.

**Fix:** let the browser send its own cookies for the socket's host, which
it does on the upgrade without being asked, and put anything else — a token, a tenant —
in the route's query:

```ts
const socket = api.ws('/room', { query: { token } }); // the route's query schema reads `token`
```

### `TypeError: Invalid URL`

**When:** every call, from a client whose base URL is relative — `'/api'`,
or an empty environment variable. A browser words it
`Failed to construct 'URL': Invalid URL`.

**Why:** the client builds each call's URL from the base alone, and a
relative URL has nothing to resolve against.

**Fix:** make it absolute; in a browser, from the page's origin:

```ts
const api = client<App>(new URL('/api', location.origin));
```

### `TypeError: Unable to connect. Is the computer able to access the url?`

That is Bun's wording; a browser says `TypeError: Failed to fetch`.

**When:** a call over HTTP, when nothing answers at the base URL.

**Why:** no response arrived, so the call has no status to resolve with:
it rejects with `fetch`'s error.

**Fix:** check the base URL and that the server is listening; catch the
error where a call may run while the server is down:

```ts
try {
	const result = await api.get('/health');
} catch (error) {
	// offline, or the server is down
}
```

### `AbortError: The operation was aborted.`

**When:** a call whose `signal` was aborted before the response arrived — over HTTP, or in process with `client(app)`.

**Why:** an aborted call rejects with the signal's reason; it does not
resolve to a result.

**Fix:** treat it as the end of the call, not as a failure:

```ts
try {
	await api.get('/users/:id', { params: { id: 1 }, signal: controller.signal });
} catch (error) {
	if (error instanceof DOMException && error.name === 'AbortError') return;
	throw error;
}
```

### `TimeoutError: The operation timed out.`

**When:** a call given `signal: AbortSignal.timeout(ms)` that took longer.

**Why:** as for [`AbortError`](#aborterror-the-operation-was-aborted), with
the timeout's reason.

**Fix:** raise the timeout, or catch `TimeoutError` by its `name` as above.

### `SyntaxError: JSON Parse error: Unexpected identifier "…"` on a call

**When:** a call whose response says `content-type: application/json` (or
any type containing `json`) and whose body is not JSON — often a proxy or
a gateway answering for the app.

**Why:** a body typed as JSON is parsed before the call resolves.

**Fix:** find what answers instead of the app; a fake `fetch` in a test
must send JSON with a JSON type:

```ts
const api = client<App>('http://api.test', {
	fetch: async () => Response.json({ error: 'not_found' }, { status: 404 }),
});
```

### `SyntaxError: JSON Parse error: Unexpected identifier "…"` in an event stream

**When:** iterating an event stream whose events are not JSON — a server
that is not `@alxia/core`, sending `data: hello`.

**Why:** the client, and `readEvents`, parse each event's `data` as JSON,
which is how `eventStream` sends it.

**Fix:** read such a stream with `EventSource`, or parse the body
yourself; from an alxia app, reply with `eventStream(schema)`.

### `Error: The socket to ws://…/… failed`

**When:** awaiting `socket.opened`, when the socket could not open: no
server, or the upgrade was refused — a guard's 401, a 400 for its params
or query. The `for await` loop over such a socket ends at once, with no
message.

**Why:** a `WebSocket` gives no status for a refused upgrade, only an
error; `opened` rejects with it.

**Fix:** await `opened` where it matters, and check the upgrade with a
plain `GET` to see the status the server answers:

```ts
const socket = api.ws('/echo/:room', { params: { room: 'lobby' } });
await socket.opened; // throws here rather than ending the loop silently
```

### `TypeError: Body already used`

**When:** calling `result.response.json()`, `.text()`, or
`.clone()` (`Body is disturbed or locked`).

**Why:** the client has read the body into `result.data` before the call
resolved.

**Fix:** use `result.data`; keep `response` for its headers.

## Traps

### A status the type does not list

**Symptom:** `result.status` is a 404, a 405, a `200` from another page, or
a status a global hook answers, while the route's type lists none of them.

**Why:** the type holds what the route may answer. Not in it: the 404 and
405 the app answers when no route matches — a base URL that does not reach
the app's root, such as one missing the path a reverse proxy serves it
under — what a proxy answers in the app's place, a `Response` returned by
a global hook, and, over HTTP, the page a redirect led to, since `fetch`
follows it.

**Fix:** point the base URL at the app's root — the paths you call already
carry the app's own prefix — and read a redirect itself with
`redirect: 'manual'`:

```ts
const api = client<App>('https://example.com/api'); // a proxy serves the app under /api
const moved = await api.get('/old', { init: { redirect: 'manual' } });
```

### A socket message never arrives

**Symptom:** the server sent a message — a welcome on open, an answer —
and no listener saw it.

**Why:** a message goes to the listeners present when it arrives; one
that arrives before `on` is called or before the `for await` loop starts
is not kept.

**Fix:** register first, then send:

```ts
const socket = api.ws('/echo/:room', { params: { room: 'lobby' } });
socket.on(handle);
socket.send({ text: 'hi' });
```

### Cookies are not sent from a browser

**Symptom:** a route with a `cookies` schema refuses, with a 400 on
`cookies`, calls that pass `cookies` from a browser, though the same call
works from Bun.

**Why:** `cookie` is a header the browser's `fetch` may not set, so it
drops it. The browser sends the origin's own cookies instead — across
origins only with `credentials: 'include'`.

**Fix:** let the browser send its cookies:

```ts
const api = client<App>('https://api.example.com');
await api.get('/me', { init: { credentials: 'include' } });
```

### The browser bundle holds the server's code

**Symptom:** the front end's bundle grows by the server, its schemas and
its dependencies, or fails to build on a server-only import.

**Why:** the app was imported as a value: `import { App } from './server'`,
or `import { app }` to write `typeof app`.

**Fix:** import its type only:

```ts
import type { App } from './server';
```

### A query or param field accepts anything

**Symptom:** a call compiles with a value the server then refuses with a
400, or any value at all is accepted for one field.

**Why:** a field the server's schema coerces with `z.coerce` has `unknown`
as its input type, so the client accepts anything for it. A path parameter
is always `string | number`, whatever its schema.

**Fix:** on the server, coerce with `zq` from
[`@alxia/zod`](https://www.npmjs.com/package/@alxia/zod), whose input is
the type a caller means to send.
