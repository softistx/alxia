# The session of a BFF

This page covers an app that renders pages over a GraphQL API and keeps the
API's session token in a cookie of its own (a backend for frontend, BFF). The
code is in `@alxia/react-router/session`: it imports `react-router` and
`/errors` alone, never `@alxia/core`, so it adds no peer.

- [Cookies](#cookies)

## Cookies

`sessionCookies` names, writes, reads and removes the two cookies a sign-in
needs: the session, which holds the API's token, and the challenge, which
carries a second factor's challenge from the password page to the code page.
Both are `HttpOnly`, so a script never reads them.

```ts
// app/session.server.ts
import { sessionCookies } from '@alxia/react-router/session';

export const cookies = sessionCookies({
	session: 'my-app_session',
	challenge: 'my-app_challenge',
	secure: !import.meta.env.DEV,
});
```

`secure` is required and is never read from the environment: pass `true`
when the app is served over HTTPS, and `false` for plain HTTP in development.
A wrong value in production would send the token over HTTP, so the package
leaves that choice to you in plain sight.

| `secure` | session cookie | challenge cookie |
| --- | --- | --- |
| `true` | `__Host-my-app_session`, `Secure` | `__Secure-my-app_challenge`, `Secure` |
| `false` | `my-app_session` | `my-app_challenge` |

Pass the base names. The package adds the prefix itself and refuses a name
that already has one.

### What is written

The bytes are, in this order:

```
Name=value; Max-Age=n; Path=/; HttpOnly[; Secure]; SameSite=Lax
```

The session cookie's value is `<expiry in ms>.<token>`, percent-encoded. A
session set by an app that wrote its own cookies in this format is read as it
is, so adopting the package does not sign anyone out.

- **`__Host-`** holds only with `Secure`, `Path=/` and no `Domain`. The session
  cookie sets exactly that, so a sibling subdomain cannot plant one that
  shadows it.
- **The challenge** is sent to `/sign-in` only (`challengePath`) and lives at
  most five minutes (`challengeSeconds`), or less when the API's challenge
  ends sooner. A sibling subdomain can plant a `__Secure-` cookie (it has no
  `Path` lock), which makes a code fail; it never yields a session.
- **The expiry in the value** only decides when the cookie is set again: the
  API alone decides whether a session is valid. A forged expiry gains nothing.

### Using them

```ts
import { cookies } from './session.server';

// After a sign-in: the API's token and the session's end.
const headers = new Headers();
headers.append('Set-Cookie', cookies.commit(token, expiresAt));

// A request's token, to send to the API as a bearer.
const session = cookies.read(request); // { token, expiresAt } or null
const token = cookies.token(request);

// Sign-out.
headers.append('Set-Cookie', cookies.destroy());

// A session the API renewed: the cookie is set again only when the expiry moved.
const renewed = cookies.refreshed(session, viewer.sessionExpiresAt); // {} or a Set-Cookie
```

`commit` takes the expiry as an ISO string or a `Date`, and sets `Max-Age`
to the seconds left: floored, and 0 for a past or unreadable date.

The challenge has its own four: `commitChallenge(challenge, expiresAt?)`,
`challengeOf(request)`, `destroyChallenge()`.

`signInPageHeaders(deadSession)` is what a signed-out visit of the sign-in page
sets. It clears the challenge blind: a client navigation fetches
`/sign-in.data`, which the cookie's path `/sign-in` does not match, so the
request never shows the challenge, yet a `Set-Cookie` with that path removes
it. With `deadSession`, it also removes a session cookie the API refused.

`serializeCookie(name, value, { maxAge, path?, secure })`, `readCookie(request,
name)` and `secondsUntil(expiresAt, now?)` are exported for the cookies of your
own (a language, a preference) that must be written in the same bytes.
`readCookie` returns the first non-empty cookie of that name, and `null` when
its value is not valid percent-encoding.

### Safari and `http://localhost`

Safari (WebKit) drops a `Secure` cookie set over `http://localhost`, where
Chromium and Firefox keep it. With `secure: true` in development, sign-in
succeeds and the next request carries no session, so the app loops back to the
sign-in page. Pass `secure: !import.meta.env.DEV`: development then sets no
`Secure` and no prefix, since the prefixes require `Secure`. See
[the troubleshooting entry](../troubleshooting.md#sign-in-loops-on-httplocalhost-in-safari).
