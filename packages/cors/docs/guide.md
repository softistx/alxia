# Guide

This page covers what `cors()` sends and when: each option, what it
defaults to, what a refused origin gets, and where the middleware sits among
an app's others.

```ts
import { alxia } from '@alxia/core';
import { cors } from '@alxia/cors';

const app = alxia()
	.use(cors({ origin: 'https://app.example.com' }))
	.get('/data', ({ reply }) => reply(200, { ok: true }));

app.listen(3000);
```

A script on `https://app.example.com` can now call `/data`, and so can any
other route of the app. A script on any other origin cannot.

## The signature

```ts
function cors(options?: CorsOptions): Middleware<Empty, Promise<Response>>;

type CorsOrigin =
	| true
	| string
	| readonly (string | RegExp)[]
	| RegExp
	| ((origin: string) => boolean);

interface CorsOptions {
	readonly origin?: CorsOrigin;
	readonly methods?: readonly string[];
	readonly allowedHeaders?: readonly string[];
	readonly exposedHeaders?: readonly string[];
	readonly credentials?: boolean;
	readonly maxAge?: number;
	readonly privateNetwork?: boolean;
}
```

`cors()` returns a middleware from `@alxia/core`: pass it to `app.use`,
called. It adds nothing to the context. `app.use` middlewares run on every
request, in the order declared, and a request no route matches — a `404`,
a `405`, a preflight to a path with no `OPTIONS` route — runs all of the
app's top-level ones too. That is how `cors()` reaches a preflight and a
`404`.

## What it does to a request

| The request | What `cors()` does |
| --- | --- |
| a preflight: `OPTIONS` with an `Access-Control-Request-Method` header | answers it itself, with a `204` and no body, without calling `next()`: no route and no middleware after it runs, and the path need not exist |
| any other request | calls `next()`, then adds the CORS headers to whatever response comes back |

"Whatever response" is every response the app sends: a route's reply, a
`404` or `405` from routing, a `400` from validation, a `500`, or a response
another middleware returned. It settles `next()` with `settle` from
`@alxia/core`, so an error the routes threw is answered, then decorated. A browser can then read the error body too, not only
the successes.

```ts
const response = await app.request('/missing', {
	headers: { origin: 'https://app.example.com' },
});
response.status;                                       // 404
response.headers.get('access-control-allow-origin');   // 'https://app.example.com'
```

A plain `OPTIONS` request, one without `Access-Control-Request-Method`, is
not a preflight: it goes on to the routes like any other method, and gets a
`405` when no `options` route matches.

## Options

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `origin` | `CorsOrigin` | `true` | which origins may call |
| `credentials` | `boolean` | `false` | sends `Access-Control-Allow-Credentials: true`, so cookies and `Authorization` go with the call |
| `methods` | `readonly string[]` | `GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS, QUERY` | `Access-Control-Allow-Methods`, on preflights |
| `allowedHeaders` | `readonly string[]` | the headers the preflight asks for | `Access-Control-Allow-Headers`, on preflights |
| `exposedHeaders` | `readonly string[]` | none | `Access-Control-Expose-Headers`, on other responses: what a script may read |
| `maxAge` | `number` (seconds) | none: the browser's own default | `Access-Control-Max-Age`, on preflights |
| `privateNetwork` | `boolean` | `false` | answers a Private Network Access preflight with `Access-Control-Allow-Private-Network: true` |

### `origin`

Which origins may call. An origin is the scheme, host and port a browser
sends in the `Origin` header — `https://app.example.com`, with no path and no
trailing slash.

```ts
cors();                                                        // every origin
cors({ origin: 'https://app.example.com' });                   // exactly this one
cors({ origin: /^https:\/\/[a-z0-9-]+\.example\.com$/ });      // every subdomain
cors({ origin: ['https://app.example.com', /^http:\/\/localhost:\d+$/] }); // a list of either
cors({ origin: (origin) => allowed.has(origin) });             // your own decision
```

| Form | Matches |
| --- | --- |
| `true` | every origin |
| a string | that origin, compared exactly: `'https://app.example.com/'` never matches, nor does `http://` for `https://` |
| a `RegExp` | every origin it `test`s true on: anchor it with `^` and `$`, or `/example\.com/` also matches `https://example.com.evil.net` |
| a list | any of its strings or patterns |
| a function | every origin it returns `true` for; a throw is logged and costs the CORS headers, never the response: a request gets the route's answer, a preflight its 204, both without them — see [the troubleshooting entry](troubleshooting.md#typeerror-invalid-url) |

What the response carries depends on the form and on `credentials`:

| `origin` | `credentials` | `Access-Control-Allow-Origin` | `Vary` |
| --- | --- | --- | --- |
| `true` (the default) | `false` | `*` | untouched |
| `true` | `true` | the request's own origin, echoed | `Origin` |
| anything else, origin allowed | either | the request's own origin, echoed | `Origin` |
| anything else, origin refused | either | none | `Origin` |

`Vary: Origin` tells a cache that the response differs by origin, so one
origin's answer is never served to another. It is added to a `Vary` the
route already sets, never replacing it:

```ts
const app = alxia()
	.use(cors({ origin: 'https://app.example.com' }))
	.get('/v', ({ reply }) => reply(200, 1, { headers: { vary: 'Accept-Encoding' } }));

const response = await app.request('/v', { headers: { origin: 'https://app.example.com' } });
response.headers.get('vary'); // 'Accept-Encoding, Origin'
```

A function receives the `Origin` header as it arrived. A sandboxed iframe or
a page opened from a file sends the string `null`, so parse defensively:

```ts
cors({
	origin: (origin) =>
		URL.canParse(origin) && new URL(origin).hostname.endsWith('.example.com'),
});
```

### `credentials`

Whether the browser may send cookies and `Authorization` with a
cross-origin call, and let the script read the answer. The browser only
sends them when the call asks for it too:

```ts
// the server
alxia().use(cors({ origin: 'https://app.example.com', credentials: true }));

// the browser, with fetch
await fetch('https://api.example.com/me', { credentials: 'include' });
```

A browser refuses `Access-Control-Allow-Origin: *` on a call with
credentials, so with `credentials: true` and no `origin`, the request's
origin is echoed back instead. That allows every site on the web to call the
app with its user's cookies: with `credentials`, name the origins.

### `methods`

The methods a preflight allows, sent as `Access-Control-Allow-Methods`. The
default is every method a route can have: `GET, HEAD, PUT, PATCH, POST,
DELETE, OPTIONS, QUERY`. Narrow it to refuse the others at the browser:

```ts
cors({ origin: 'https://app.example.com', methods: ['GET', 'POST'] });
```

`GET`, `HEAD` and `POST` with safelisted headers need no preflight, so a
browser sends them whatever this list says. A `QUERY` always has a
preflight, and is refused by a list without it. `methods` decides what a
browser may send, not what a route answers.

### `allowedHeaders`

The request headers a preflight allows, sent as
`Access-Control-Allow-Headers`. By default, the middleware echoes the
preflight's `Access-Control-Request-Headers` — whatever the script asked to
send — and adds `Access-Control-Request-Headers` to `Vary`. A list replaces
that:

```ts
cors({
	origin: 'https://app.example.com',
	allowedHeaders: ['content-type', 'authorization'],
});
```

With a list, a call sending any other non-safelisted header fails its
preflight in the browser.

### `exposedHeaders`

The response headers a script may read beyond the safelisted ones
(`Cache-Control`, `Content-Language`, `Content-Length`, `Content-Type`,
`Expires`, `Last-Modified`, `Pragma`). Anything else reads as `null` in the
browser unless it is listed here:

```ts
const app = alxia()
	.use(cors({ origin: 'https://app.example.com', exposedHeaders: ['x-total', 'etag'] }))
	.get('/items', ({ reply }) => reply(200, [], { headers: { 'x-total': '0' } }));
```

```ts
// in the browser
const response = await fetch('https://api.example.com/items');
response.headers.get('x-total'); // '0'; null without exposedHeaders
```

It is sent on every response to an allowed origin, not on preflights.

### `maxAge`

How long, in seconds, the browser may cache a preflight's answer before
sending another, as `Access-Control-Max-Age`. Unset, the header is not sent
and the browser uses its own short default. Browsers also cap the value at
their own maximum.

```ts
cors({ origin: 'https://app.example.com', maxAge: 600 }); // one preflight per ten minutes
```

### `privateNetwork`

Chrome's Private Network Access sends a preflight with
`Access-Control-Request-Private-Network: true` before a public page calls a
server on a private network or on `localhost`. With `privateNetwork: true`,
that preflight is answered with `Access-Control-Allow-Private-Network: true`;
any other preflight is answered as usual.

```ts
cors({ origin: 'https://app.example.com', privateNetwork: true });
```

## A refused origin

A refused origin gets no `Access-Control-Allow-*` header — only
`Vary: Origin` — and the browser blocks the script from reading the answer.
Its preflight is still a `204`, without the headers, and the browser stops
there.

CORS is a rule browsers apply, not access control. A request that needs no
preflight — a `GET`, or a form `POST` — still reaches the route and runs it;
only the script's view of the response is blocked. A request from `curl` or
another server has no `Origin` header and is not affected at all:

| `origin` | A request with no `Origin` header gets |
| --- | --- |
| `true`, without `credentials` | `Access-Control-Allow-Origin: *` |
| anything else | no CORS header |

Authenticate a route as if `cors()` were not there.

## Where it sits

Middlewares nest: the first `use` is the outermost. A middleware declared
before `cors()` that returns a `Response` — a `401` for a missing token,
say — answers the preflight first, without CORS headers, and the browser
reports a failed preflight. Use `cors()` first, and a guard after it:

```ts
import { alxia, defineMiddleware } from '@alxia/core';
import { cors } from '@alxia/cors';

const authenticated = defineMiddleware((ctx, next) =>
	ctx.request.headers.has('authorization') ? next() : new Response(null, { status: 401 }),
);

const app = alxia()
	.use(cors({ origin: 'https://app.example.com' })) // first: preflights stop here
	.use(authenticated)
	.get('/data', ({ reply }) => reply(200, { ok: true }));
```

The `401` itself still carries the CORS headers, so the script can read it:
`cors()` settles what the guard returns on its way out. A guard on the app
runs on a request no route matches too, so an anonymous request to a missing
path gets the `401`, not the `404`; scope it with a `group`, or with a path
(`use('/api', authenticated)`, a guard that adds nothing to the context), to
guard only some routes.

Declare it on the app itself, not in a `group`. A group's middlewares run on
its routes and on a request no route matches under its prefix, a preflight
included, but not outside it: a `cors()` in `group('/api')` answers the
preflights of `/api/…` and none of the other paths. A route
declared before `app.use(cors())` is not covered either. An app mounted with
`app.plugin(otherApp)` brings its middlewares to the app, unmatched requests
included, so a plugin app may hold the `cors()`; an app has one CORS policy.

Declare `cors()` after `logger()` and `secureHeaders()` so they see the
preflight's `204` and the headers it adds, and before `compress()`, which
compresses what comes back through it.

`@alxia/graphql` leaves GraphQL Yoga's own CORS off by default, so the
GraphQL endpoint follows this middleware like any other route.

## A realistic setup

A single-page app on its own origin, a session cookie, a paginated list
whose total the page reads from a header, and local development on any
`localhost` port:

```ts
import { alxia } from '@alxia/core';
import { cors } from '@alxia/cors';

const origins = (process.env['CORS_ORIGINS'] ?? 'https://app.example.com').split(',');

export const app = alxia()
	.use(
		cors({
			origin: [...origins, /^http:\/\/localhost:\d+$/],
			credentials: true,
			exposedHeaders: ['x-total'],
			maxAge: 600,
		}),
	)
	.get('/items', ({ reply }) => reply(200, ['a', 'b'], { headers: { 'x-total': '2' } }));
```

And its tests, without a server — `app.fetch` takes a `Request` with any
method and header, preflights included:

```ts
import { describe, expect, test } from 'bun:test';
import { app } from './app';

const preflight = (origin: string) =>
	new Request('http://localhost/items', {
		method: 'OPTIONS',
		headers: { origin, 'access-control-request-method': 'GET' },
	});

describe('cors', () => {
	test('the app answers its own origin, with credentials', async () => {
		const response = await app.request('/items', {
			headers: { origin: 'https://app.example.com' },
		});
		expect(response.headers.get('access-control-allow-origin')).toBe('https://app.example.com');
		expect(response.headers.get('access-control-allow-credentials')).toBe('true');
		expect(response.headers.get('access-control-expose-headers')).toBe('x-total');
	});

	test('a preflight from localhost is answered', async () => {
		const response = await app.fetch(preflight('http://localhost:5173'));
		expect(response.status).toBe(204);
		expect(response.headers.get('access-control-allow-origin')).toBe('http://localhost:5173');
		expect(response.headers.get('access-control-max-age')).toBe('600');
	});

	test('another origin gets no CORS header', async () => {
		const response = await app.fetch(preflight('https://evil.example'));
		expect(response.status).toBe(204);
		expect(response.headers.get('access-control-allow-origin')).toBeNull();
	});
});
```

When a browser still refuses a call, [Troubleshooting](troubleshooting.md)
starts from the message in its console.
