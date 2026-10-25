# Troubleshooting

Each entry is headed by the text you see: a TypeScript error, an exception,
a browser console message, or a header that is or is not on a response.
`secureHeaders`, `csp()`, `pageHeaders()` and `clearSiteData()` throw only
at startup, on options they cannot send; `cacheControl` is an option of
`secureHeaders`. What goes wrong otherwise is a type, a browser refusing what a header forbids,
or a header in the wrong place.

**Types**

- [`Type 'true' is not assignable to type 'Setting | undefined'`](#type-true-is-not-assignable-to-type-setting--undefined)
- [`No overload matches this call` … `is not assignable to type 'SecureHeadersOptions' with 'exactOptionalPropertyTypes: true'`](#no-overload-matches-this-call--is-not-assignable-to-type-secureheadersoptions-with-exactoptionalpropertytypes-true)
- [`No overload matches this call` … `Object literal may only specify known properties, and '…' does not exist in type 'SecureHeadersOptions & …'`](#no-overload-matches-this-call--object-literal-may-only-specify-known-properties-and--does-not-exist-in-type-secureheadersoptions--)
- [`Type 'undefined' is not assignable to type 'SecureHeadersOptions & { readonly nonce: true; }'`](#type-undefined-is-not-assignable-to-type-secureheadersoptions---readonly-nonce-true-)
- [`Property 'nonce' does not exist on type 'RouteBase<…>'`](#property-nonce-does-not-exist-on-type-routebase)
- [`No overload matches this call` … `Type 'boolean' is not assignable to type 'true'`](#no-overload-matches-this-call--type-boolean-is-not-assignable-to-type-true)
- [`Type 'string' is not assignable to type 'CspValue | undefined'`](#type-string-is-not-assignable-to-type-cspvalue--undefined)
- [`Object literal may only specify known properties, and 'contentSecurityPolicy' does not exist in type 'PageHeadersOptions'`](#object-literal-may-only-specify-known-properties-and-contentsecuritypolicy-does-not-exist-in-type-pageheadersoptions)
- [`Property 'https' is missing in type '{}' but required in type 'PageHeadersOptions'`](#property-https-is-missing-in-type--but-required-in-type-pageheadersoptions)
- [`Type '"cash"' is not assignable to type '"cookies" | "*" | "cache" | "storage" | "executionContexts" | "clientHints" | "prefetchCache" | "prerenderCache"'`](#type-cash-is-not-assignable-to-type-cookies----cache--storage--executioncontexts--clienthints--prefetchcache--prerendercache)

**Runtime**

- [`TypeError: secureHeaders: … is empty; give false to leave the … header out`](#typeerror-secureheaders--is-empty-give-false-to-leave-the--header-out)
- [`use(): argument 1 looks like a factory (<name>): call it, use(<name>())`](#use-argument-1-looks-like-a-factory-name-call-it-usename)
- [`TypeError: secureHeaders: nonce is on, but the content-security-policy has no script-src to add it to: …`](#typeerror-secureheaders-nonce-is-on-but-the-content-security-policy-has-no-script-src-to-add-it-to-)
- [`TypeError: secureHeaders: nonce is on, but contentSecurityPolicy is false: …`](#typeerror-secureheaders-nonce-is-on-but-contentsecuritypolicy-is-false-)
- [`TypeError: secureHeaders: contentSecurityPolicy names NONCE, but nonce is off: give nonce: true`](#typeerror-secureheaders-contentsecuritypolicy-names-nonce-but-nonce-is-off-give-nonce-true)
- [`TypeError: csp(): <name> has no source: write ["'none'"] to allow nothing, or false to leave it out`](#typeerror-csp-name-has-no-source-write-none-to-allow-nothing-or-false-to-leave-it-out)
- [`TypeError: csp(): "<name>" is not a directive name: write lowercase letters, digits and hyphens, starting with a letter, as in "script-src"`](#typeerror-csp-name-is-not-a-directive-name-write-lowercase-letters-digits-and-hyphens-starting-with-a-letter-as-in-script-src)
- [`TypeError: csp(): <name> has the source "<source>", which is empty or holds ";", "," or a space: a source is one token, so split a list into several sources, and write a comma inside a URL as %2C`](#typeerror-csp-name-has-the-source-source-which-is-empty-or-holds---or-a-space-a-source-is-one-token-so-split-a-list-into-several-sources-and-write-a-comma-inside-a-url-as-2c)
- [`TypeError: csp(): no directive is left: give at least one, such as { "default-src": ["'none'"] }`](#typeerror-csp-no-directive-is-left-give-at-least-one-such-as--default-src-none-)
- [`TypeError: clearSiteData(): no type is given: write at least one, such as ["cache"]`](#typeerror-clearsitedata-no-type-is-given-write-at-least-one-such-as-cache)
- [`TypeError: clearSiteData(): "<type>" is not a type: write one of "cache", "cookies", "storage", "executionContexts", "clientHints", "prefetchCache", "prerenderCache", "*"`](#typeerror-clearsitedata-type-is-not-a-type-write-one-of-cache-cookies-storage-executioncontexts-clienthints-prefetchcache-prerendercache-)
- [`TypeError: pageHeaders(): script-src has no NONCE: a page script runs only with the response's nonce, so write script-src with NONCE in directives, such as ["'self'", NONCE, "'strict-dynamic'"]`](#typeerror-pageheaders-script-src-has-no-nonce-a-page-script-runs-only-with-the-responses-nonce-so-write-script-src-with-nonce-in-directives-such-as-self-nonce-strict-dynamic)
- [`TypeError: pageHeaders(): script-src-elem has no NONCE: script elements follow it instead of script-src, so add NONCE to it, or give false to remove it`](#typeerror-pageheaders-script-src-elem-has-no-nonce-script-elements-follow-it-instead-of-script-src-so-add-nonce-to-it-or-give-false-to-remove-it)
- [`TypeError: pageHeaders(): <name> cannot be removed from a page policy: …`](#typeerror-pageheaders-name-cannot-be-removed-from-a-page-policy-)
- [`TypeError: csp(): <value> in <directive> is a keyword: write it quoted, '<value>'`](#typeerror-csp-value-in-directive-is-a-keyword-write-it-quoted-value)
- [`TypeError: clearSiteData(): methods is empty or holds an empty method: write at least one, such as ["POST"], or leave methods out`](#typeerror-clearsitedata-methods-is-empty-or-holds-an-empty-method-write-at-least-one-such-as-post-or-leave-methods-out)

**In the browser**

- [`Refused to load the … because it violates the following Content Security Policy directive: "default-src 'none'"`](#refused-to-load-the--because-it-violates-the-following-content-security-policy-directive-default-src-none)
- [`Refused to send form data to '…' because it violates the following Content Security Policy directive: "form-action 'none'"`](#refused-to-send-form-data-to--because-it-violates-the-following-content-security-policy-directive-form-action-none)
- [`Refused to execute inline script because it violates the following Content Security Policy directive: "script-src 'self' 'nonce-…'"`](#refused-to-execute-inline-script-because-it-violates-the-following-content-security-policy-directive-script-src-self-nonce-)
- [Inline style attributes stop applying once `style-src` has the nonce](#inline-style-attributes-stop-applying-once-style-src-has-the-nonce)
- [A third-party script or font is refused by a page policy](#a-third-party-script-or-font-is-refused-by-a-page-policy)
- [`Refused to frame '…' because an ancestor violates the following Content Security Policy directive: "frame-ancestors 'none'"`](#refused-to-frame--because-an-ancestor-violates-the-following-content-security-policy-directive-frame-ancestors-none)
- [`net::ERR_BLOCKED_BY_RESPONSE.NotSameOrigin`](#neterr_blocked_by_responsenotsameorigin)
- [`window.opener` is `null` in a sign-in popup](#windowopener-is-null-in-a-sign-in-popup)
- [A subdomain on plain HTTP no longer opens](#a-subdomain-on-plain-http-no-longer-opens)

**Headers**

- [An option has no effect on a response](#an-option-has-no-effect-on-a-response)
- [A CDN still caches a page, though `cacheControl` is set](#a-cdn-still-caches-a-page-though-cachecontrol-is-set)
- [`X-Powered-By` or `Server` is still sent](#x-powered-by-or-server-is-still-sent)
- [A response arrives without the headers](#a-response-arrives-without-the-headers)
- [A 404 or a route outside a group has no headers](#a-404-or-a-route-outside-a-group-has-no-headers)
- [A `try`/`catch` middleware's reply has no headers](#a-trycatch-middlewares-reply-has-no-headers)
- [A route has no headers, though the others do](#a-route-has-no-headers-though-the-others-do)
- [`Clear-Site-Data` is missing on a client-side sign-out](#clear-site-data-is-missing-on-a-client-side-sign-out)

## Types

### `Type 'true' is not assignable to type 'Setting | undefined'`

**When:** a header option is given `true`, an object or an array.

```text
error TS2769: No overload matches this call.
  Overload 1 of 2, '(options: SecureHeadersOptions & { readonly nonce: true; }): NonceMiddleware', gave the following error.
    Type 'true' is not assignable to type 'Setting'.
  Overload 2 of 2, '(options?: (SecureHeadersOptions & { readonly nonce?: false; }) | undefined): SecureHeaders', gave the following error.
    Type 'true' is not assignable to type 'Setting | undefined'.
```

An object, `{ defaultSrc: [...] }`, reads the same with its own type in
place of `'true'`.

`hidePoweredBy` given anything but a boolean is the same error, against
`'boolean | undefined'`.

**Why:** a header option is the header's value as a string, or `false` to
leave it out (`Setting`, exported, is `string | false`). There is no
`true` — leaving the key out is the default. The option takes a string,
and `csp()` builds that string from directives
([guide](guide.md#writing-the-policy-as-directives)).

**Fix:** write the header as it goes out, or leave the key out:

```ts
app.use(
	secureHeaders({
		contentSecurityPolicy: "default-src 'self'; img-src 'self' data:",
		// xFrameOptions: true  →  leave it out for 'DENY'
	}),
);
```

### `No overload matches this call` … `is not assignable to type 'SecureHeadersOptions' with 'exactOptionalPropertyTypes: true'`

**When:** an option is set to `undefined`, often from a condition, with
`exactOptionalPropertyTypes` on.

```text
error TS2769: No overload matches this call.
  Overload 1 of 2, '(options: SecureHeadersOptions & { readonly nonce: true; }): NonceMiddleware', gave the following error.
    Argument of type '{ xFrameOptions: undefined; }' is not assignable to parameter of type 'SecureHeadersOptions & { readonly nonce: true; }' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
      Type '{ xFrameOptions: undefined; }' is not assignable to type 'SecureHeadersOptions' with 'exactOptionalPropertyTypes: true'. Consider adding 'undefined' to the types of the target's properties.
  Overload 2 of 2, '(options?: (SecureHeadersOptions & { readonly nonce?: false; }) | undefined): SecureHeaders', gave the following error.
    Argument of type '{ xFrameOptions: undefined; }' is not assignable to parameter of type 'SecureHeadersOptions & { readonly nonce?: false; }' with 'exactOptionalPropertyTypes: true'. …
```

**Why:** the options are optional, not `undefined`-able. Under that flag a
key present with `undefined` is not a key left out.

**Fix:** spread the key in only when it has a value:

```ts
const production = Bun.env.NODE_ENV === 'production';

app.use(secureHeaders({ ...(production ? {} : { strictTransportSecurity: false }) }));
```

### `No overload matches this call` … `Object literal may only specify known properties, and '…' does not exist in type 'SecureHeadersOptions & …'`

**When:** an option names a header the plugin does not send, or uses
another library's name for one.

```text
error TS2769: No overload matches this call.
  Overload 1 of 2, '(options: SecureHeadersOptions & { readonly nonce: true; }): NonceMiddleware', gave the following error.
    Object literal may only specify known properties, and 'xPoweredBy' does not exist in type 'SecureHeadersOptions & { readonly nonce: true; }'.
  Overload 2 of 2, '(options?: (SecureHeadersOptions & { readonly nonce?: false; }) | undefined): SecureHeaders', gave the following error.
    Object literal may only specify known properties, and 'xPoweredBy' does not exist in type 'SecureHeadersOptions & { readonly nonce?: false; }'.
```

**Why:** the options are the twelve headers in the
[guide](guide.md#the-options), plus `hidePoweredBy` and `nonce`. `X-Powered-By` and
`Server` are governed by `hidePoweredBy`; anything else —
`Content-Security-Policy-Report-Only`, `X-XSS-Protection` — is not sent by
the middleware.

**Fix:** `hidePoweredBy` for those two; a middleware of your own for another
header:

```ts
import { alxia, defineMiddleware, settle, withHeaders } from '@alxia/core';
import { secureHeaders } from '@alxia/secure-headers';

const reportOnly = defineMiddleware(async (ctx, next) =>
	withHeaders(await settle(ctx, next()), (headers) =>
		headers.set('content-security-policy-report-only', "default-src 'self'"),
	),
);

const app = alxia()
	.use(secureHeaders({ hidePoweredBy: true }))
	.use(reportOnly);
```

### `Type 'undefined' is not assignable to type 'SecureHeadersOptions & { readonly nonce: true; }'`

**When:** `secureHeaders` is given to `app.use` without being called.

```text
error TS2345: Argument of type '{ (options: SecureHeadersOptions & { readonly nonce: true; }): NonceMiddleware; (options?: (SecureHeadersOptions & { ...; }) | undefined): SecureHeaders; }' is not assignable to parameter of type '{ (options: SecureHeadersOptions & { readonly nonce: true; }): NonceMiddleware; (options?: (SecureHeadersOptions & { ...; }) | undefined): SecureHeaders; } & Step<...>'.
  Type '{ (options: SecureHeadersOptions & { readonly nonce: true; }): NonceMiddleware; (options?: (SecureHeadersOptions & { ...; }) | undefined): SecureHeaders; }' is not assignable to type 'Step<BaseContext & Empty, (SecureHeadersOptions & { readonly nonce?: false; }) | undefined, MiddlewareReturn>'.
    Types of parameters 'options' and 'ctx' are incompatible.
      Type '(SecureHeadersOptions & { readonly nonce?: false; }) | undefined' is not assignable to type 'SecureHeadersOptions & { readonly nonce: true; }'.
        Type 'undefined' is not assignable to type 'SecureHeadersOptions & { readonly nonce: true; }'.
          Type 'undefined' is not assignable to type 'SecureHeadersOptions'.
```

**Why:** `secureHeaders` makes the middleware from its options; the
middleware is what it returns. Given to `use` as it is, it is read as a
middleware whose context is its options, and TypeScript says those do not
fit its first overload, the nonce one.

**Fix:** call it, with or without options:

```ts
app.use(secureHeaders());
```

### `Property 'nonce' does not exist on type 'RouteBase<…>'`

**When:** a route or a middleware reads `nonce` from its context.

```text
error TS2339: Property 'nonce' does not exist on type 'RouteBase<RouteApp<Method, Empty, "">, "/">'.
error TS2339: Property 'nonce' does not exist on type 'BaseContext & Empty'.
```

The second is a `derive` or a middleware.

**Why:** only `secureHeaders({ nonce: true })` adds it, and only to the
routes declared after its `app.use`. Without `nonce: true`, or on a route
declared before it, there is none.

**Fix:** turn it on, and declare the routes that read it after it:

```ts
alxia()
	.use(secureHeaders({ nonce: true, contentSecurityPolicy: "script-src 'self'" }))
	.get('/', ({ nonce, reply }) => reply(200, nonce));
```

### `No overload matches this call` … `Type 'boolean' is not assignable to type 'true'`

**When:** `nonce` is given a `boolean` that is not a literal: a flag from
the environment, say.

```text
error TS2769: No overload matches this call.
  Overload 1 of 2, '(options: SecureHeadersOptions & { readonly nonce: true; }): NonceMiddleware', gave the following error.
    Type 'boolean' is not assignable to type 'true'.
  Overload 2 of 2, '(options?: (SecureHeadersOptions & { readonly nonce?: false; }) | undefined): SecureHeaders', gave the following error.
    Type 'boolean' is not assignable to type 'false'.
```

**Why:** `nonce: true` changes the middleware's type, since it adds `nonce`
to the context. A `boolean` leaves TypeScript unable to say whether the
routes read one.

**Fix:** pick the call by the flag, so each has a literal:

```ts
const policy = "default-src 'self'; script-src 'self'";
const app = useNonce
	? alxia().use(secureHeaders({ nonce: true, contentSecurityPolicy: policy }))
	: alxia().use(secureHeaders({ contentSecurityPolicy: policy }));
```

Or keep it on everywhere: the nonce costs one random draw per request.

### `Type 'string' is not assignable to type 'CspValue | undefined'`

**When:** a directive of `csp()`, or of `pageHeaders({ directives })`, is given a bare string instead of a list.

```text
error TS2322: Type 'string' is not assignable to type 'CspValue | undefined'.
```

**Why:** a directive's value is a list of sources (`readonly string[]`), `true` for a bare directive, or `false` to leave it out. One string would be one source, and a space inside it is refused at startup.

**Fix:** write a list, even for one source:

```ts
csp({ 'script-src': ["'self'"] });
```

### `Object literal may only specify known properties, and 'contentSecurityPolicy' does not exist in type 'PageHeadersOptions'`

**When:** `pageHeaders()` is given `contentSecurityPolicy`. `'nonce'` gives the same message, with the name changed.

```text
error TS2353: Object literal may only specify known properties, and 'contentSecurityPolicy' does not exist in type 'PageHeadersOptions'.
```

**Why:** a page policy is written through `directives`, merged over `PAGE_DIRECTIVES`, and always carries a nonce, so neither `contentSecurityPolicy` nor `nonce` is an option of `pageHeaders()`.

**Fix:** use `directives`, and drop `nonce`:

```ts
pageHeaders({ https: true, directives: { 'img-src': ["'self'", 'https://img.example'] } });
```

For a whole policy of your own, use `secureHeaders({ nonce: true, contentSecurityPolicy: csp(…) })`.

### `Property 'https' is missing in type '{}' but required in type 'PageHeadersOptions'`

**When:** `pageHeaders({})`, or an options object without `https`.

```text
error TS2345: Argument of type '{}' is not assignable to parameter of type 'PageHeadersOptions'.
  Property 'https' is missing in type '{}' but required in type 'PageHeadersOptions'.
```

**Why:** `https` switches HSTS and `upgrade-insecure-requests`, and the package never reads the environment to guess it.

**Fix:** pass your own flag:

```ts
pageHeaders({ https: import.meta.env.PROD });
```

### `Type '"cash"' is not assignable to type '"cookies" | "*" | "cache" | "storage" | "executionContexts" | "clientHints" | "prefetchCache" | "prerenderCache"'`

**When:** `clearSiteData(['cash'])`, a type the header does not know, or a type of `ClearSiteDataType` misspelled.

```text
error TS2322: Type '"cash"' is not assignable to type '"cookies" | "*" | "cache" | "storage" | "executionContexts" | "clientHints" | "prefetchCache" | "prerenderCache"'.
```

The union is `ClearSiteDataType`, written out.

**Why:** the browser ignores a type it does not know, so the cache would stay as it was without a word.

**Fix:** use one of the listed types, in a list:

```ts
clearSiteData(['cache']);
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

### `use(): argument 1 looks like a factory (<name>): call it, use(<name>())`

**When:** `alxia().use(secureHeaders)`, `use(pageHeaders)` or
`use(clearSiteData)`, a factory given uncalled, in JavaScript or past a
cast. `<name>` is the factory's. It throws where the app is declared, since
alxia 0.5; before, each request was answered with a 500 and the log said
`GET /: a middleware (secureHeaders) returned function: …`. TypeScript
refuses it first, with `"this looks like a factory given uncalled: …"` in
the error.

**Why:** `use` takes a middleware, a `(ctx, next)` function; `secureHeaders`,
`pageHeaders` and `clearSiteData` make one, and are marked as factories, so
`use`, a route and `plugin` refuse them.

**Fix:** call it:

```ts
const app = alxia()
	.use(secureHeaders())
	.get('/', ({ reply }) => reply(200, 'ok'));
```

### `TypeError: secureHeaders: nonce is on, but the content-security-policy has no script-src to add it to: …`

**When:** `nonce: true`, with a policy that has neither a `script-src` (or
`script-src-elem`) nor `NONCE` — the default policy among them. It throws
at startup:

```text
TypeError: secureHeaders: nonce is on, but the content-security-policy has no script-src to add it to: write one, or place NONCE where the nonce goes (the policy is "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'")
```

**Why:** the nonce goes in a directive. Without `script-src`, scripts fall
back on `default-src`, and adding a `script-src` of the middleware's own would
change what else they may load.

**Fix:** write the `script-src` you want, or say where the nonce goes:

```ts
import { NONCE, secureHeaders } from '@alxia/secure-headers';

app.use(secureHeaders({ nonce: true, contentSecurityPolicy: "default-src 'self'; script-src 'self'" }));
app.use(secureHeaders({ nonce: true, contentSecurityPolicy: `default-src 'self' ${NONCE}` }));
```

### `TypeError: secureHeaders: nonce is on, but contentSecurityPolicy is false: …`

**When:** `nonce: true` and `contentSecurityPolicy: false` together.

```text
TypeError: secureHeaders: nonce is on, but contentSecurityPolicy is false: a nonce is only read through the content-security-policy header
```

**Why:** a browser only honours a nonce the response's policy names; with
no policy there is nothing for it to allow.

**Fix:** give a policy, or drop `nonce`. A route that writes its own policy
with `ctx.nonce` still needs the middleware's: give the app one, and let the
route's replace it ([guide](guide.md#who-reads-it)).

### `TypeError: secureHeaders: contentSecurityPolicy names NONCE, but nonce is off: give nonce: true`

**When:** the policy holds `NONCE`, and `nonce` is left out or `false`.
It throws at startup:

```text
TypeError: secureHeaders: contentSecurityPolicy names NONCE, but nonce is off: give nonce: true
```

**Why:** without `nonce: true` the placeholder would go out as it is,
`'nonce-{alxia}'`, which allows nothing and reads as a mistake in a
browser's console.

**Fix:**

```ts
import { NONCE, secureHeaders } from '@alxia/secure-headers';

app.use(secureHeaders({ nonce: true, contentSecurityPolicy: `script-src 'self' ${NONCE}` }));
```

### `TypeError: csp(): <name> has no source: write ["'none'"] to allow nothing, or false to leave it out`

**When:** `csp()` is given an empty array for a directive. It throws at once, so the app fails at startup:

```text
TypeError: csp(): <name> has no source: write ["'none'"] to allow nothing, or false to leave it out
```

**Why:** an empty list says nothing a browser can use, and omitting the directive is not the same as forbidding everything.

**Fix:**

```ts
csp({ 'img-src': ["'none'"] }); // allow nothing
csp({ 'img-src': false }); // leave the directive out
```

### `TypeError: csp(): "<name>" is not a directive name: write lowercase letters, digits and hyphens, starting with a letter, as in "script-src"`

**When:** a key of the object is not lowercase letters, digits and hyphens starting with a letter, such as `scriptSrc`, `Script-Src` or `-x`. It throws at once, so the app fails at startup:

```text
TypeError: csp(): "<name>" is not a directive name: write lowercase letters, digits and hyphens, starting with a letter, as in "script-src"
```

**Why:** directive names are written as in the header; a camel-cased key would name a directive no browser knows, so it is refused, not sent.

**Fix:**

```ts
csp({ 'script-src': ["'self'"] });
```

### `TypeError: csp(): <name> has the source "<source>", which is empty or holds ";", "," or a space: a source is one token, so split a list into several sources, and write a comma inside a URL as %2C`

**When:** a source is an empty string, or holds `;`, `,` or whitespace, usually a whole list or a second directive in one string. It throws at once, so the app fails at startup:

```text
TypeError: csp(): <name> has the source "<source>", which is empty or holds ";", "," or a space: a source is one token, so split a list into several sources, and write a comma inside a URL as %2C
```

**Why:** a `;` would end the directive and start another, so a value could smuggle in a directive; a space would pass two sources as one; a `,` would split the header in two for a proxy. A comma inside a URL is legitimate, so percent-encode it as `%2C`.

**Fix:**

```ts
csp({ 'img-src': ["'self'", 'data:'] }); // not ["'self' data:"]
```

### `TypeError: csp(): no directive is left: give at least one, such as { "default-src": ["'none'"] }`

**When:** every directive is `false` or `undefined`, or the object is empty. It throws at once, so the app fails at startup:

```text
TypeError: csp(): no directive is left: give at least one, such as { "default-src": ["'none'"] }
```

**Why:** an empty policy is no policy; it would be sent as an empty header.

**Fix:**

```ts
csp({ 'default-src': ["'none'"] });
// or leave the header out: secureHeaders({ contentSecurityPolicy: false })
```

### `TypeError: clearSiteData(): no type is given: write at least one, such as ["cache"]`

**When:** `clearSiteData([])`, called with no type, throws where the app is declared.

**Why:** a `Clear-Site-Data` header with no value tells the browser nothing.

**Fix:** name what to clear:

```ts
app.use('/sign-out', clearSiteData(['cache']));
```

### `TypeError: clearSiteData(): "<type>" is not a type: write one of "cache", "cookies", "storage", "executionContexts", "clientHints", "prefetchCache", "prerenderCache", "*"`

**When:** a type is misspelled (`'cash'`) or is not one the header knows, past a cast or in JavaScript. TypeScript refuses it first.

**Why:** the browser ignores a type it does not know, so the cache would stay as it was without a word.

**Fix:** use one of the types the message lists:

```ts
app.use('/sign-out', clearSiteData(['cache', 'cookies']));
```

### `TypeError: pageHeaders(): script-src has no NONCE: a page script runs only with the response's nonce, so write script-src with NONCE in directives, such as ["'self'", NONCE, "'strict-dynamic'"]`

**When:** `pageHeaders({ directives: { 'script-src': [...] } })` gives a `script-src` without `NONCE`, or `false`, and the app is declared.

**Why:** a page script runs only with the response's nonce. A `script-src` that lacks `NONCE` would leave every script of the page refused, and the page would not hydrate.

**Fix:** keep `NONCE` in the list you give, with `'strict-dynamic'` after it:

```ts
import { NONCE, pageHeaders } from '@alxia/secure-headers';

pageHeaders({
	https: true,
	directives: { 'script-src': ["'self'", NONCE, "'strict-dynamic'"] },
});
```

### `TypeError: pageHeaders(): script-src-elem has no NONCE: script elements follow it instead of script-src, so add NONCE to it, or give false to remove it`

**When:** `pageHeaders({ directives: { 'script-src-elem': [...] } })` gives a `script-src-elem` list without `NONCE`.

**Why:** browsers that support CSP level 3 check `<script>` elements against `script-src-elem` when it is present, and ignore `script-src` for them. A list without `NONCE` would leave every script of the page refused, and the page would not hydrate.

**Fix:** add `NONCE` to the list, or give `false` to remove the directive so `script-src` governs again:

```ts
import { NONCE, pageHeaders } from '@alxia/secure-headers';

pageHeaders({
	https: true,
	directives: { 'script-src-elem': ["'self'", NONCE, "'strict-dynamic'"] },
});
```

### `TypeError: pageHeaders(): <name> cannot be removed from a page policy: …`

**When:** `pageHeaders({ directives: { 'default-src': false } })`, or `false` or `true` for `base-uri` or `object-src`. The app fails where it is declared.

```text
TypeError: pageHeaders(): base-uri cannot be removed from a page policy: it has no fallback, so an injected <base> would redirect nonced relative scripts, so give it a list of sources
```

**Why:** `default-src` covers frame, media and child sources, and `base-uri` has no fallback, so without it an injected `<base>` would redirect the nonced relative scripts. `object-src` blocks plugin content.

**Fix:** give the directive a list, or leave it out of `directives` to keep the preset's:

```ts
pageHeaders({ https: true, directives: { 'base-uri': ["'self'"] } });
```

### `TypeError: csp(): <value> in <directive> is a keyword: write it quoted, '<value>'`

**When:** a source of `csp()` is `self`, `none`, `unsafe-inline`, `unsafe-eval`, `unsafe-hashes`, `strict-dynamic`, `wasm-unsafe-eval`, `report-sample` or `inline-speculation-rules`, or starts `nonce-`, `sha256-`, `sha384-` or `sha512-`, written without its single quotes (in any case). The same goes for `pageHeaders({ directives })`.

```text
TypeError: csp(): self in script-src is a keyword: write it quoted, 'self'
```

**Why:** a browser reads `self` as a host called `self`, not as this site, and ignores the keyword it meant. The policy would be looser or stricter than written, without a word.

**Fix:** quote it inside the string:

```ts
csp({ 'script-src': ["'self'", NONCE] });
```

### `TypeError: clearSiteData(): methods is empty or holds an empty method: write at least one, such as ["POST"], or leave methods out`

**When:** `clearSiteData(['cache'], { methods: [] })`, or a `methods` list that holds `''`. It throws where the app is declared.

**Why:** with no method, the middleware would never send the header, and the sign-out would leave the cache as it was.

**Fix:** name the methods, or leave `methods` out for `['POST']`:

```ts
clearSiteData(['cache'], { methods: ['POST', 'DELETE'] });
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

### `Refused to execute inline script because it violates the following Content Security Policy directive: "script-src 'self' 'nonce-…'"`

**When:** `nonce: true` is on, and a page's inline script does not run.
Chrome adds `Either the 'unsafe-inline' keyword, a hash ('sha256-…'), or a
nonce ('nonce-...') is required to enable inline execution.`

**Why:** the script carries no nonce, or another request's: one cached with
the page, or written into the HTML at build time. Each response allows only
its own.

**Fix:** write the request's `ctx.nonce` on each `<script>`, and never
cache a page whose HTML holds one:

```ts
.get('/', ({ nonce, reply }) =>
	reply(200, `<script nonce="${nonce}">…</script>`, {
		headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
	}),
)
```

With React Router, `nonceOf(loadContext)` in `entry.server.tsx` does it for
every script it renders; see
[its troubleshooting](https://github.com/softistx/alxia/blob/develop/packages/react-router/docs/troubleshooting.md#a-script-of-the-page-has-no-nonce).

### Inline style attributes stop applying once `style-src` has the nonce

**When:** `NONCE` is put in `style-src`, which also has `'unsafe-inline'`,
and every `style="…"` attribute is ignored: Chrome prints `Refused to apply
inline style because it violates the following Content Security Policy
directive: "style-src 'self' 'unsafe-inline' 'nonce-…'". Note that
'unsafe-inline' is ignored if either a hash or nonce value is present in
the source list.`

**Why:** a nonce in a directive turns its `'unsafe-inline'` off, and an
attribute cannot carry a nonce. That is why `nonce: true` alone leaves
`style-src` as written.

**Fix:** keep the nonce out of `style-src`, or allow the attributes in a
directive of their own:

```ts
contentSecurityPolicy: `default-src 'self'; script-src 'self'; style-src-elem 'self' ${NONCE}; style-src-attr 'unsafe-inline'`,
```

### A third-party script or font is refused by a page policy

**When:** a page behind `pageHeaders()` loads a script, a stylesheet or a font from another origin, and the console reads `Refused to load the script 'https://…' because it violates the following Content Security Policy directive: "script-src 'self' 'nonce-…' 'strict-dynamic'"` (or `font-src 'self'`).

**Why:** `PAGE_DIRECTIVES` allows this site only. A script another script adds is allowed through `'strict-dynamic'`; one named in the HTML needs the nonce, and a font needs its origin in `font-src`.

**Fix:** extend the directive that loads it through `directives`, which replaces that directive's list, so repeat what it already holds:

```ts
pageHeaders({
	https: true,
	directives: {
		'font-src': ["'self'", 'https://fonts.example'],
		'style-src-elem': ["'self'", NONCE, 'https://fonts.example'],
	},
});
```

Never put the origin in `default-src`. Under `'strict-dynamic'` a third-party script is loaded by a nonced script, not by allowlisting its host: a script tag from another origin takes the page's `nonce` attribute, and a host in `script-src` is ignored by browsers that support `'strict-dynamic'`. To allow a host for images, extend `img-src` the same way, as in `directives: { 'img-src': ["'self'", 'https://img.example'] }`.

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

**Why:** the middleware never overwrites a header the response already has.
A route set it on its reply or on `set.headers`, a middleware declared
after `secureHeaders` set it on the way out, or one declared before it
overwrote it.
`@alxia/graphql`'s IDE sets its own `Content-Security-Policy` on purpose.

**Fix:** find what sets it on that route, and change it there:

```ts
const response = await app.request('/the-route');
console.log(response.headers.get('content-security-policy'));
```

### A CDN still caches a page, though `cacheControl` is set

**When:** `cacheControl: 'private, no-store'` is set, and some pages are still
stored by a cache.

**Why:** a route that sets its own `Cache-Control` (a `reply` with
`cache-control: public, max-age=…`, or a middleware after `secureHeaders`)
keeps it: the option only fills a header the response lacks.

**Fix:** drop the route's header, or give it the same value. Before, the
route's own header wins:

```ts
app.get('/the-page', ({ reply }) =>
	reply(200, html, { headers: { 'cache-control': 'public, max-age=60' } }),
);
```

After, the route leaves it to `secureHeaders` (or says `private, no-store`
itself):

```ts
app.get('/the-page', ({ reply }) => reply(200, html));

const response = await app.request('/the-page');
console.log(response.headers.get('cache-control')); // private, no-store
```

### `X-Powered-By` or `Server` is still sent

**When:** `hidePoweredBy` is on (the default), and one of them is on the
response.

**Why:** the middleware deletes them when the response comes back through
it. A middleware declared **before** `secureHeaders` that adds one sees the
response after that, and keeps it. A proxy in front of the app may add its
own `Server` too.

**Fix:** declare `secureHeaders` before the middleware that adds the header,
or stop that middleware adding it:

```ts
import { alxia, defineMiddleware, settle, withHeaders } from '@alxia/core';
import { secureHeaders } from '@alxia/secure-headers';

const poweredBy = defineMiddleware(async (ctx, next) =>
	withHeaders(await settle(ctx, next()), (headers) => headers.set('x-powered-by', 'my-app')),
);

const app = alxia()
	.use(secureHeaders()) // outermost: deletes the header on the way out
	.use(poweredBy);
```

### A response arrives without the headers

**When:** a response has none of the headers, though `secureHeaders` is
in use.

**Why:** the middleware decorates what comes back through it, and two
responses do not: a WebSocket upgrade that succeeds (the `101`), and a page
served with `page()`, which `Bun.serve` answers itself.

**Fix:** serve a page that needs the headers through a route, `file` or
`static` rather than `page()` — or give it its policy in its HTML with
`<meta http-equiv="Content-Security-Policy" content="…">`, where browsers
ignore `frame-ancestors`. A middleware declared before `secureHeaders`,
whose own work may fail, catches it and still returns what `next()`
resolved to, which already carries the headers:

```ts
const timing = defineMiddleware(async (ctx, next) => {
	const response = await next();
	try {
		recordTiming(response); // your own work
	} catch (error) {
		console.error(error);
	}
	return response;
});

const app = alxia().use(timing).use(secureHeaders());
```

### A 404 or a route outside a group has no headers

**When:** `secureHeaders` is used inside a `group`, and a route outside the
group, or a request that matches no route, comes back without them.

**Why:** a middleware declared in a `group` stays inside the group: it runs
on its routes and on a request no route matches under its prefix, and on
nothing else: not on a route outside the group, nor declared after it.

**Fix:** use it on the app, and give the routes that differ their own
values on their replies:

```ts
import { alxia } from '@alxia/core';
import { secureHeaders } from '@alxia/secure-headers';

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

### A `try`/`catch` middleware's reply has no headers

**When:** a middleware wraps `next()` in a `try`/`catch` to answer errors in
its own format, is declared before `secureHeaders()`, and its reply comes
back without the security headers.

**Why:** `secureHeaders` settles `next()`: it sets the headers on the response
the route boundary would give (the `HttpError`'s status, or a 500), then the error goes on to the middlewares around it. A `try`/`catch`
declared **before** it catches the error, but its reply is made outside
`secureHeaders`, so it carries no headers; the 500 inside did.

**Fix:** declare the error-handling middleware after `secureHeaders`, so
the headers are set on its reply:

```ts
import { alxia, defineMiddleware } from '@alxia/core';
import { secureHeaders } from '@alxia/secure-headers';

const errors = defineMiddleware(async (_ctx, next) => {
	try {
		return await next();
	} catch (error) {
		return Response.json({ error: String(error) }, { status: 500 });
	}
});

const app = alxia()
	.use(secureHeaders()) // first
	.use(errors)
	.get('/boom', () => {
		throw new Error('boom');
	});
```

### A route has no headers, though the others do

**When:** one route's responses lack the headers, while a `404` or another
route's have them.

**Why:** a route declared **before** `app.use(secureHeaders())` does not run
it. A request no route matches runs every top-level middleware wherever it
is declared, which is why its `404` is covered.

**Fix:** declare `secureHeaders` before the routes:

```ts
const app = alxia()
	.use(secureHeaders())
	.get('/early', ({ reply }) => reply(200, 'now covered'));
```

### `Clear-Site-Data` is missing on a client-side sign-out

**When:** a form sign-out empties the cache, but a client-side one (the button, a navigation) does not. `Clear-Site-Data` is on the response of `POST /sign-out` and absent from `POST /sign-out.data`.

**Why:** React Router's single fetch posts the route's `.data` URL, a path `use('/sign-out', …)` does not cover. A route cannot set the header there either: that answer carries a redirect's cookies, not its other headers.

**Fix:** mount the middleware on both paths:

```ts
const cleared = clearSiteData(['cache']);

const app = alxia()
	.use('/sign-out', cleared)
	.use('/sign-out.data', cleared);
```
