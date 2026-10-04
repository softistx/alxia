# Troubleshooting

Each entry is headed by the text you see: a line in the browser's console,
a response, a line in the server log, or an error from `tsc`. The browser
lines are Chrome's wording, which prefixes them with
`Access to fetch at '…' from origin '…' has been blocked by CORS policy:`;
Firefox and Safari say the same thing in other words.

**In the browser**

- [`No 'Access-Control-Allow-Origin' header is present on the requested resource.`](#no-access-control-allow-origin-header-is-present-on-the-requested-resource)
- [`Response to preflight request doesn't pass access control check: It does not have HTTP ok status.`](#response-to-preflight-request-doesnt-pass-access-control-check-it-does-not-have-http-ok-status)
- [`The value of the 'Access-Control-Allow-Origin' header in the response must not be the wildcard '*' when the request's credentials mode is 'include'.`](#the-value-of-the-access-control-allow-origin-header-in-the-response-must-not-be-the-wildcard--when-the-requests-credentials-mode-is-include)
- [`The value of the 'Access-Control-Allow-Credentials' header in the response is '' which must be 'true' when the request's credentials mode is 'include'.`](#the-value-of-the-access-control-allow-credentials-header-in-the-response-is--which-must-be-true-when-the-requests-credentials-mode-is-include)
- [`Request header field x-token is not allowed by Access-Control-Allow-Headers in preflight response.`](#request-header-field-x-token-is-not-allowed-by-access-control-allow-headers-in-preflight-response)
- [`Method PUT is not allowed by Access-Control-Allow-Methods in preflight response.`](#method-put-is-not-allowed-by-access-control-allow-methods-in-preflight-response)
- [`response.headers.get('x-total')` is `null`](#responseheadersgetx-total-is-null)

**Responses**

- [`405 {"error":"method_not_allowed"}` on an `OPTIONS` request](#405-errormethod_not_allowed-on-an-options-request)
- [A route's responses carry no CORS header, though the others do](#a-routes-responses-carry-no-cors-header-though-the-others-do)
- [`401` on every request to a path that does not exist](#401-on-every-request-to-a-path-that-does-not-exist)
- [`Access-Control-Allow-Origin: https://example.com.evil.net`](#access-control-allow-origin-httpsexamplecomevilnet)
- [A refused origin's request still ran the route](#a-refused-origins-request-still-ran-the-route)

**Server log**

- [`TypeError: Invalid URL`](#typeerror-invalid-url)

**Types**

- [`Type 'false' is not assignable to type 'CorsOrigin | undefined'`](#type-false-is-not-assignable-to-type-corsorigin--undefined)
- [`Type 'CorsMiddleware' is not assignable to type 'MiddlewareReturn'`](#type-corsmiddleware-is-not-assignable-to-type-middlewarereturn)
- [`Type 'string' is not assignable to type 'readonly string[]'`](#type-string-is-not-assignable-to-type-readonly-string)

## In the browser

### `No 'Access-Control-Allow-Origin' header is present on the requested resource.`

Also as `Response to preflight request doesn't pass access control check: No 'Access-Control-Allow-Origin' header is present on the requested resource.`

**When:** the page's origin is not one `origin` allows, or the app does not
use `cors()` at all.

**Why:** a refused origin gets no `Access-Control-Allow-Origin` — its
preflight is a bare `204` — and the browser blocks the script. The usual
cause is an origin that does not match exactly: a trailing slash, `http`
for `https`, a missing port, `www.` on one side only. The page's origin is
in the console line, after `from origin`.

**Fix:** list the origin exactly as the browser sends it — scheme, host and
port, nothing after:

```ts
cors({ origin: ['https://app.example.com', 'http://localhost:5173'] });
```

### `Response to preflight request doesn't pass access control check: It does not have HTTP ok status.`

**When:** a call that needs a preflight — a `PUT` or `DELETE`, a JSON
body, an `Authorization` header — and the preflight is answered with an
error status.

**Why:** one of three things answered the preflight instead of `cors()`:

- the app does not use `cors()`, and routing answers the `OPTIONS` with a
  `405` — see [the next section](#405-errormethod_not_allowed-on-an-options-request);
- `cors()` is declared in a `group`: it answers the preflights under the
  group's prefix, and not the others, which the app answers with a `405`;
- a middleware declared **before** `cors()` returned a response — a `401`
  for a missing token, a `429` — and middlewares run in the order they are
  declared. A browser never sends credentials on a preflight, so an
  authentication guard refuses every one.

**Fix:** use `cors()` first, on the app, before any middleware that can
answer early:

```ts
import { alxia, defineMiddleware } from '@alxia/core';
import { cors } from '@alxia/cors';

const app = alxia()
	.use(cors({ origin: 'https://app.example.com' }))   // first
	.use(defineMiddleware((ctx, next) =>
		ctx.request.headers.has('authorization') ? next() : new Response(null, { status: 401 }),
	))
	.get('/data', ({ reply }) => reply(200, { ok: true }));
```

### `The value of the 'Access-Control-Allow-Origin' header in the response must not be the wildcard '*' when the request's credentials mode is 'include'.`

**When:** the page calls with `credentials: 'include'`, and the app uses
`cors()` with no `origin` and no `credentials`.

**Why:** with every origin allowed and no `credentials`, the response
carries `Access-Control-Allow-Origin: *`, which a browser never accepts on a
call with cookies.

**Fix:** turn `credentials` on, and name the origins — with `credentials`
alone, every site on the web may call the app with its user's cookies:

```ts
cors({ origin: 'https://app.example.com', credentials: true });
```

### `The value of the 'Access-Control-Allow-Credentials' header in the response is '' which must be 'true' when the request's credentials mode is 'include'.`

**When:** the page calls with `credentials: 'include'`, and the app names
its origins but does not set `credentials`.

**Why:** `Access-Control-Allow-Credentials: true` is only sent with
`credentials: true`.

**Fix:**

```ts
cors({ origin: ['https://app.example.com'], credentials: true });
```

### `Request header field x-token is not allowed by Access-Control-Allow-Headers in preflight response.`

**When:** `allowedHeaders` is a list, and the page sends a header that is
not in it.

**Why:** with a list, the preflight allows those headers and no other.
Without `allowedHeaders`, the middleware allows whatever the preflight asks
for, and this cannot happen.

**Fix:** add the header, or drop `allowedHeaders` to allow what is asked:

```ts
cors({
	origin: 'https://app.example.com',
	allowedHeaders: ['content-type', 'authorization', 'x-token'],
});
```

### `Method PUT is not allowed by Access-Control-Allow-Methods in preflight response.`

**When:** `methods` is a list without the method the page calls with.

**Why:** the preflight's `Access-Control-Allow-Methods` is that list. The
default lists every method but `CONNECT` and `TRACE`.

**Fix:** add the method, or drop `methods`:

```ts
cors({ origin: 'https://app.example.com', methods: ['GET', 'POST', 'PUT'] });
```

### `response.headers.get('x-total')` is `null`

**When:** a script reads a response header the route sets — `x-total`,
`etag`, `location` — and gets `null`, although the header is in the
network panel.

**Why:** a cross-origin script only reads the safelisted headers
(`Cache-Control`, `Content-Language`, `Content-Length`, `Content-Type`,
`Expires`, `Last-Modified`, `Pragma`) and those the response exposes.

**Fix:** expose it:

```ts
cors({ origin: 'https://app.example.com', exposedHeaders: ['x-total', 'etag'] });
```

## Responses

### `405 {"error":"method_not_allowed"}` on an `OPTIONS` request

**When:** an `OPTIONS` request to a path that has routes for other
methods.

**Why:** either the app does not use `cors()` (or uses it in a `group` whose prefix the path is not under), or the request is not a
preflight: `cors()` only answers an `OPTIONS` that carries
`Access-Control-Request-Method`, as a browser's does. A plain `OPTIONS` —
from `curl`, or a test that forgets the header — goes to routing like any
other method.

**Fix:** use `cors()`, and send a preflight the way a browser does:

```ts
const response = await app.fetch(
	new Request('http://localhost/data', {
		method: 'OPTIONS',
		headers: {
			origin: 'https://app.example.com',
			'access-control-request-method': 'POST',
		},
	}),
);
response.status; // 204
```

### `Access-Control-Allow-Origin: https://example.com.evil.net`

**When:** `origin` is a `RegExp`, or a list holding one, that is not
anchored, such as `/example\.com/`.

**Why:** a pattern is matched with `test`, which finds it anywhere in the
origin, so `https://example.com.evil.net` and `https://notexample.com`
pass too.

**Fix:** anchor it, and escape the dots:

```ts
cors({ origin: /^https:\/\/([a-z0-9-]+\.)?example\.com$/ });
```

### A route's responses carry no CORS header, though the others do

**When:** one route's replies lack `Access-Control-Allow-Origin`, while a
`404` or another route's replies have it.

**Why:** a route declared **before** `app.use(cors())` does not run it; a
request no route matches runs every top-level middleware wherever it is
declared, which is why its `404` is covered. Likewise `cors()` used inside a
`group` covers only that group's routes.

**Fix:** declare `cors()` first, on the app:

```ts
const app = alxia()
	.use(cors({ origin: 'https://app.example.com' }))
	.get('/items', ({ reply }) => reply(200, []));
```

### `401` on every request to a path that does not exist

**When:** an anonymous request to a missing path is answered `401` where you
expected a `404`, with the CORS headers on it.

**Why:** a guard declared on the app with `use` (an authentication
middleware, `bearer`, a required session) runs on a request no route matches
too, before its `404`.

**Fix:** scope the guard to the routes it protects:

```ts
const app = alxia()
	.use(cors({ origin: 'https://app.example.com' }))
	.use('/api', authenticated)
	.get('/api/data', ({ reply }) => reply(200, { ok: true }));
```

### A refused origin's request still ran the route

**When:** a `GET`, or a `POST` with a form or plain-text body, from an
origin `cors()` refuses. The route runs, and its side effects happen; only
the script cannot read the answer.

**Why:** such a request needs no preflight, so the browser sends it as it
is, and the CORS headers only decide whether the page may read the
response. CORS protects the user's browser, not the server.

**Fix:** authenticate and authorise the route itself, and keep anything
that changes state off `GET`:

```ts
app.derive(({ request, reply }) =>
	request.headers.has('authorization') ? {} : reply(401, { error: 'unauthenticated' as const }),
);
```

## Server log

### `TypeError: Invalid URL`

**When:** an `origin` function throws — typically `new URL(origin)` on the
`Origin: null` that a sandboxed iframe or a page opened from a file sends.

**Why:** the function runs in the middleware, which logs the throw and
treats the origin as refused: a throw costs the CORS headers, never the
response. A preflight is answered with its `204`, without them; any other
request gets the route's answer, without them. The browser refuses both as
it would a refused origin.

**Fix:** make the function total — it returns `false` for what it cannot
read:

```ts
cors({
	origin: (origin) =>
		URL.canParse(origin) && new URL(origin).hostname.endsWith('.example.com'),
});
```

## Types

### `Type 'false' is not assignable to type 'CorsOrigin | undefined'`

```text
error TS2322: Type 'false' is not assignable to type 'CorsOrigin | undefined'.
```

**When:** `cors({ origin: false })`, to turn CORS off.

**Why:** `origin` is `true`, a string, a `RegExp`, a list or a function;
there is no off switch inside the middleware.

**Fix:** do not use the middleware where CORS should be off:

```ts
const origins = process.env['CORS_ORIGINS']?.split(',');

const base = alxia();
const app = origins ? base.use(cors({ origin: origins })) : base;
```

### `Type 'CorsMiddleware' is not assignable to type 'MiddlewareReturn'`

```text
error TS2769: No overload matches this call.
  Overload 1 of 11, '(m1: ScopeMiddleware<Empty, [], MiddlewareReturn>): AppAfterUse<Empty, "", never, [MiddlewareReturn]>', gave the following error.
    Argument of type '(options?: CorsOptions) => CorsMiddleware' is not assignable to parameter of type 'ScopeMiddleware<Empty, [], MiddlewareReturn>'.
      Type '(options?: CorsOptions) => CorsMiddleware' is not assignable to type '(ctx: BaseContext & Empty, next: NextFunction) => MiddlewareReturn'.
        Type 'CorsMiddleware' is not assignable to type 'MiddlewareReturn'.
  Overload 2 of 11, '(plugin: (app: Alxia<Empty, "", never>) => AnyAlxia): AnyAlxia', gave the following error.
    …
        Type 'Alxia<Empty, "", never>' has no properties in common with type 'CorsOptions'.
```

**When:** `app.use(cors)`, without calling it.

**Why:** `cors` makes the middleware; it is not the middleware.

**Fix:** call it, with no options for the defaults:

```ts
alxia().use(cors());
```

### `Type 'string' is not assignable to type 'readonly string[]'`

```text
error TS2322: Type 'string' is not assignable to type 'readonly string[]'.
```

**When:** `methods`, `allowedHeaders` or `exposedHeaders` is given as a
string, such as `methods: 'GET, POST'`.

**Why:** each is a list; the middleware joins it.

**Fix:**

```ts
cors({ methods: ['GET', 'POST'] });
```
