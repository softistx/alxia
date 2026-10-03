# Troubleshooting

Each entry is headed by the text you see: a TypeScript error, an exception,
a browser console message, or a header that is or is not on a response.
`secureHeaders` itself throws nothing; what goes wrong is a type, a
browser refusing what a header forbids, or a header in the wrong place.

**Types**

- [`Type 'true' is not assignable to type 'Setting | undefined'`](#type-true-is-not-assignable-to-type-setting--undefined)
- [`… is not assignable to parameter of type 'SecureHeadersOptions' with 'exactOptionalPropertyTypes: true'`](#-is-not-assignable-to-parameter-of-type-secureheadersoptions-with-exactoptionalpropertytypes-true)
- [`Object literal may only specify known properties, and '…' does not exist in type 'SecureHeadersOptions'`](#object-literal-may-only-specify-known-properties-and--does-not-exist-in-type-secureheadersoptions)
- [`No overload matches this call` … `has no properties in common with type 'SecureHeadersOptions'`](#no-overload-matches-this-call--has-no-properties-in-common-with-type-secureheadersoptions)

**Runtime**

- [`TypeError: secureHeaders: … is empty; give false to leave the … header out`](#typeerror-secureheaders--is-empty-give-false-to-leave-the--header-out)
- [`TypeError: alxia().use(secureHeaders).get is not a function`](#typeerror-alxiausesecureheadersget-is-not-a-function)

**In the browser**

- [`Refused to load the … because it violates the following Content Security Policy directive: "default-src 'none'"`](#refused-to-load-the--because-it-violates-the-following-content-security-policy-directive-default-src-none)
- [`Refused to send form data to '…' because it violates the following Content Security Policy directive: "form-action 'none'"`](#refused-to-send-form-data-to--because-it-violates-the-following-content-security-policy-directive-form-action-none)
- [`Refused to frame '…' because an ancestor violates the following Content Security Policy directive: "frame-ancestors 'none'"`](#refused-to-frame--because-an-ancestor-violates-the-following-content-security-policy-directive-frame-ancestors-none)
- [`net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`](#neterr_blocked_by_responsenotsameorigin)
- [`window.opener` is `null` in a sign-in popup](#windowopener-is-null-in-a-sign-in-popup)
- [A subdomain on plain HTTP no longer opens](#a-subdomain-on-plain-http-no-longer-opens)

**Headers**

- [An option has no effect on a response](#an-option-has-no-effect-on-a-response)
- [`X-Powered-By` or `Server` is still sent](#x-powered-by-or-server-is-still-sent)
- [A response arrives without the headers](#a-response-arrives-without-the-headers)
- [Routes outside a group get the headers](#routes-outside-a-group-get-the-headers)

## Types

### `Type 'true' is not assignable to type 'Setting | undefined'`

**When:** a header option is given `true`, an object or an array.

```text
error TS2322: Type 'true' is not assignable to type 'Setting | undefined'.
error TS2322: Type '{ defaultSrc: string[]; }' is not assignable to type 'Setting | undefined'.
```

`hidePoweredBy` given anything but a boolean is the same error, against
`'boolean | undefined'`.

**Why:** a header option is the header's value as a string, or `false` to
leave it out (`Setting`, exported, is `string | false`). There is no
`true` — leaving the key out is the default — and no object form for a
policy.

**Fix:** write the header as it goes out, or leave the key out:

```ts
app.use(
	secureHeaders({
		contentSecurityPolicy: "default-src 'self'; img-src 'self' data:",
		// xFrameOptions: true  →  leave it out for 'DENY'
	}),
);
```

### `… is not assignable to parameter of type 'SecureHeadersOptions' with 'exactOptionalPropertyTypes: true'`

**When:** an option is set to `undefined`, often from a condition, with
`exactOptionalPropertyTypes` on.

```text
error TS2379: Argument of type '{ xFrameOptions: undefined; }' is not assignable to parameter of type 'SecureHeadersOptions' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
```

**Why:** the options are optional, not `undefined`-able. Under that flag a
key present with `undefined` is not a key left out.

**Fix:** spread the key in only when it has a value:

```ts
const production = Bun.env.NODE_ENV === 'production';

app.use(secureHeaders({ ...(production ? {} : { strictTransportSecurity: false }) }));
```

### `Object literal may only specify known properties, and '…' does not exist in type 'SecureHeadersOptions'`

**When:** an option names a header the plugin does not send, or uses
another library's name for one.

```text
error TS2353: Object literal may only specify known properties, and 'xPoweredBy' does not exist in type 'SecureHeadersOptions'.
```

**Why:** the options are the twelve headers in the
[guide](guide.md#the-options), plus `hidePoweredBy`. `X-Powered-By` and
`Server` are governed by `hidePoweredBy`; anything else —
`Content-Security-Policy-Report-Only`, `X-XSS-Protection` — is not sent by
the plugin.

**Fix:** `hidePoweredBy` for those two; a hook of your own for another
header:

```ts
import { alxia, withHeaders } from '@alxia/core';
import { secureHeaders } from '@alxia/secure-headers';

const app = alxia()
	.use(secureHeaders({ hidePoweredBy: true }))
	.onResponse((response) =>
		withHeaders(response, (headers) =>
			headers.set('content-security-policy-report-only', "default-src 'self'"),
		),
	);
```

### `No overload matches this call` … `has no properties in common with type 'SecureHeadersOptions'`

**When:** `secureHeaders` is given to `use` without being called.

```text
error TS2769: No overload matches this call.
  Overload 1 of 2, '(plugin: (app: Alxia<Empty, Empty, "", never>) => AnyAlxia): AnyAlxia', gave the following error.
    Argument of type '(options?: SecureHeadersOptions | undefined) => Plugin' is not assignable to parameter of type '(app: Alxia<Empty, Empty, "", never>) => AnyAlxia'.
      Types of parameters 'options' and 'app' are incompatible.
        Type 'Alxia<Empty, Empty, "", never>' has no properties in common with type 'SecureHeadersOptions'.
```

**Why:** `secureHeaders` makes the plugin from its options; the plugin is
what it returns.

**Fix:** call it, with or without options:

```ts
app.use(secureHeaders());
```

## Runtime

### `TypeError: secureHeaders: … is empty; give false to leave the … header out`

**When:** `secureHeaders()` is called with a header option set to `''`, or
to spaces only, usually to turn a header off. It throws at once, so the app
fails at startup:

```text
TypeError: secureHeaders: xFrameOptions is empty; give false to leave the x-frame-options header out
```

**Why:** a header with an empty value says nothing a browser can act on.
Only `false` leaves a header out.

**Fix:**

```ts
app.use(secureHeaders({ xFrameOptions: false }));
```

### `TypeError: alxia().use(secureHeaders).get is not a function`

**When:** the same mistake as above in JavaScript, or past a cast: the
chain breaks on the next method after `use(secureHeaders)`.

**Why:** `use` calls the function with the app. Uncalled, `secureHeaders`
reads the app as its options and returns a plugin, not the app, so the
next `.get` is called on a function.

**Fix:**

```ts
const app = alxia()
	.use(secureHeaders())
	.get('/', ({ reply }) => reply(200, 'ok'));
```

## In the browser

These messages are Chrome's wording; Firefox and Safari report the same
refusal in their own words.

### `Refused to load the … because it violates the following Content Security Policy directive: "default-src 'none'"`

**When:** the app serves an HTML page, and the page's styles, scripts,
images or fonts do not load. Chrome adds `Note that 'style-src-elem' was
not explicitly set, so 'default-src' is used as a fallback.` or similar.
Inline code reads `Refused to execute inline script …` or
`Refused to apply inline style …`.

**Why:** the default `Content-Security-Policy` is for an API:
`default-src 'none'` lets a response load nothing.

**Fix:** give the pages a policy on their reply, and keep the strict one for
the API:

```ts
app.get('/', ({ reply }) =>
	reply(200, html, {
		headers: {
			'content-type': 'text/html; charset=utf-8',
			'content-security-policy': "default-src 'self'; img-src 'self' data:; frame-ancestors 'none'",
		},
	}),
);
```

or set `contentSecurityPolicy` for the whole app. See the
[guide](guide.md#an-app-that-serves-html-too).

### `Refused to send form data to '…' because it violates the following Content Security Policy directive: "form-action 'none'"`

**When:** a `<form>` on a page the app serves is submitted, and nothing
happens.

**Why:** the default policy has `form-action 'none'`: the page may post no
form, even to itself.

**Fix:** allow your origin in that page's policy:

```ts
const PAGE_POLICY = "default-src 'self'; form-action 'self'; base-uri 'self'; frame-ancestors 'none'";
```

### `Refused to frame '…' because an ancestor violates the following Content Security Policy directive: "frame-ancestors 'none'"`

**When:** a page puts a response of the app in an `<iframe>`. With the
policy turned off, the message becomes `Refused to display '…' in a frame
because it set 'X-Frame-Options' to 'deny'.`

**Why:** two headers refuse framing: `frame-ancestors 'none'` in the
default policy, and `X-Frame-Options: DENY`. Turning one off leaves the
other.

**Fix:** change both:

```ts
app.use(
	secureHeaders({
		contentSecurityPolicy: "default-src 'none'; frame-ancestors 'self'",
		xFrameOptions: 'SAMEORIGIN',
	}),
);
```

### `net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`

**When:** a page on another origin embeds a response of the app — an
`<img>`, a `<script>`, a `no-cors` fetch — and the network panel shows it
blocked, although it answered 200.

**Why:** `Cross-Origin-Resource-Policy: same-origin` lets only the app's own
origin embed its responses. A CORS `fetch` is not concerned.

**Fix:** open it for the app when it serves public assets, or for the
routes that need it, on their reply:

```ts
app.use(secureHeaders({ crossOriginResourcePolicy: 'cross-origin' }));
```

### `window.opener` is `null` in a sign-in popup

**When:** a page of the app opens a popup to another origin — a sign-in,
a payment — and the popup cannot report back, or the page sees the popup
as closed at once.

**Why:** `Cross-Origin-Opener-Policy: same-origin` puts the page in a
browsing context group of its own, cut from any window of another origin.

**Fix:**

```ts
app.use(secureHeaders({ crossOriginOpenerPolicy: 'same-origin-allow-popups' }));
```

### A subdomain on plain HTTP no longer opens

**When:** after a browser has visited the app over HTTPS, another host
under the same domain, served over plain HTTP, is forced to HTTPS and fails.

**Why:** the default `Strict-Transport-Security` is
`max-age=31536000; includeSubDomains`: the browser remembers, for a year,
to use HTTPS for the host **and every subdomain**. A browser ignores the
header on a plain-HTTP response, so it bites only once the app is reached
over HTTPS.

**Fix:** drop `includeSubDomains` when a subdomain is still on HTTP, or the
header altogether where the app is not served over HTTPS:

```ts
app.use(secureHeaders({ strictTransportSecurity: 'max-age=31536000' }));
```

A browser that already stored the policy keeps it until it expires, or
until it reads `max-age=0` from the host over HTTPS.

## Headers

### An option has no effect on a response

**When:** an option is set, and some responses still carry another value.

**Why:** the plugin never overwrites a header the response already has.
A route set it on its reply or on `set.headers`, an `onResponse` hook
declared before `secureHeaders` set it, or one declared after overwrote it.
`@alxia/openapi`'s reference page and `@alxia/graphql`'s IDE set their own
`Content-Security-Policy` on purpose.

**Fix:** find what sets it on that route, and change it there:

```ts
const response = await app.request('/the-route');
console.log(response.headers.get('content-security-policy'));
```

### `X-Powered-By` or `Server` is still sent

**When:** `hidePoweredBy` is on (the default), and one of them is on the
response.

**Why:** the plugin deletes them when its hook runs. An `onResponse` hook
declared after `secureHeaders` that adds one runs later, and keeps it. A
proxy in front of the app may add its own `Server` too.

**Fix:** declare `secureHeaders` after the hook that adds the header, or
stop that hook adding it:

```ts
import { alxia, withHeaders } from '@alxia/core';
import { secureHeaders } from '@alxia/secure-headers';

const app = alxia()
	.onResponse((response) =>
		withHeaders(response, (headers) => headers.set('x-powered-by', 'my-app')),
	)
	.use(secureHeaders()); // its hook runs after, and deletes it
```

### A response arrives without the headers

**When:** a response has none of the headers, though `secureHeaders` is
in use.

**Why:** the plugin is an `onResponse` hook, and three responses run no
`onResponse` hook: a WebSocket upgrade that succeeds (the `101`), a page
served with `page()`, which `Bun.serve` answers itself, and the 500 sent
when an `around` hook throws.

**Fix:** serve a page that needs the headers through a route, `file` or
`static` rather than `page()` — or give it its policy in its HTML with
`<meta http-equiv="Content-Security-Policy" content="…">`, where browsers
ignore `frame-ancestors`. An `around` hook whose own work may fail catches
it and still returns what `next()` resolved to, which already carries the
headers:

```ts
app.around(async (_ctx, next) => {
	const response = await next();
	try {
		recordTiming(response); // your own work
	} catch (error) {
		console.error(error);
	}
	return response;
});
```

### Routes outside a group get the headers

**When:** `secureHeaders` is used inside a `group`, meant for its routes
only, and every route of the app gets the headers.

**Why:** it adds a global hook, and a group's global hooks are the app's.

**Fix:** use it on the app, and give the routes that differ their own
values on their replies:

```ts
const app = alxia()
	.use(secureHeaders())
	.get('/embed', ({ reply }) =>
		reply(200, 'ok', {
			headers: {
				'content-security-policy': "default-src 'none'; frame-ancestors 'self'",
				'x-frame-options': 'SAMEORIGIN',
			},
		}),
	);
```
