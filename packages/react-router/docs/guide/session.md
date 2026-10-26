# A BFF session

This page is for an app that is the backend of its own pages (a BFF) and
calls a GraphQL API that signs users in. It grows with
`@alxia/react-router/session`, whose code imports `react-router` and `/errors`
alone, and `@alxia/react-router/session/model`, the part that imports
nothing and is safe in a component as well as in a loader.

- [Redirects that stay on the site](#redirects-that-stay-on-the-site)
- [The sign-in pages' paths](#the-sign-in-pages-paths)
- [Cookies](#cookies)
- [The step-up state](#the-step-up-state)
- [Codes and types](#codes-and-types)

## Redirects that stay on the site

After a sign-in the user goes back to the page they came from, carried in
`next`. A `next` is whatever the request says, so it is checked before any
redirect: `safeNext` answers a path of this site (with its search and hash),
and `/` for anything else.

```ts
import { safeNext } from '@alxia/react-router/session/model';

safeNext('/orders/42?tab=items'); // '/orders/42?tab=items'
safeNext('//evil.test'); // '/'
safeNext('https://evil.test/'); // '/'
safeNext('/a/..//evil.test'); // '/'
```

It refuses a value that does not start with `/`, one that starts with `//`,
one holding a backslash, a space or a control character (a browser drops a
tab or a newline, or reads `\` as `/`), a value over 2000 characters, and
one that resolves to another site once its dot segments are applied. A
percent-encoded `//` stays a path of this site; it is not decoded.

`nextOf(request.url)` from [`@alxia/react-router/errors`](errors.md) is the
page a request is for, and `safeNext` is applied on the way back.

## The sign-in pages' paths

`signInPath(next)` is the sign-in page's URL, coming back to `next`, and
`secondFactorPath(next)` the second-factor page's. Both go through
`safeNext`, and add no `next` for the home page.

```ts
import {
	SIGN_IN_PATHS,
	secondFactorPath,
	signInPath,
} from '@alxia/react-router/session/model';

signInPath('/orders'); // '/sign-in?next=%2Forders'
signInPath('/', { query: { expired: '1' } }); // '/sign-in?expired=1'
signInPath('/orders', { path: '/login' }); // '/login?next=%2Forders'
secondFactorPath('/orders'); // '/sign-in/second-factor?next=%2Forders'
```

`SIGN_IN_PATHS` holds the defaults, `/sign-in` and `/sign-in/second-factor`.
If every `next` comes out as `/`, see
[`next` is always `/`](../troubleshooting.md#next-is-always-).

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
// An expiry that is absent or not a date changes nothing: the cookie is kept.
const renewed = cookies.refreshed(session, viewer.sessionExpiresAt); // {} or a Set-Cookie
```

`refreshed` never ends a session because the API sent an expiry it cannot read: it returns `{}` for a missing or unparseable one, and the API alone decides when a session is over.

`commit` takes the expiry as an ISO string or a `Date`, and sets `Max-Age`
to the seconds left: floored, and 0 for a past or unreadable date.

The challenge has its own three: `commitChallenge(challenge, expiresAt?)`,
`challengeOf(request)`, `destroyChallenge()`.

`signInPageHeaders(deadSession)` is what a signed-out visit of the sign-in page
sets. It clears the challenge blind: a client navigation fetches
`/sign-in.data`, which the cookie's path `/sign-in` does not match, so the
request never shows the challenge, yet a `Set-Cookie` with that path removes
it. With `deadSession`, it also removes a session cookie the API refused.

`serializeCookie(name, value, { maxAge, path?, secure })` (a name that is not an RFC 6265 token, or a path with a `;` or a control character, throws a `TypeError`; a `maxAge` that is not finite is 0), `readCookie(request,
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

## The step-up state

A step-up asks for a code before a sensitive action. `stepUpReducer` holds
its state on the page, with no React: `phase` (`idle`, `requesting`, `code`,
`confirming`, `done`), the `via` that confirms it (`email` or
`secondFactor`), the `challenge` held, `attemptsLeft`, `locked`, `error`
(`invalid`, `expired` or `failed`), `pending` and `resent`.

`stepUpProps(state)` gives the part a code form shows (not the challenge, a
secret that stays out of the markup):

```ts
import {
	INITIAL_STEP_UP,
	stepUpProps,
	stepUpReducer,
} from '@alxia/react-router/session/model';

let state = stepUpReducer(INITIAL_STEP_UP, { type: 'start' });
state = stepUpReducer(state, {
	type: 'requested',
	answer: {
		ok: true,
		intent: 'request-step-up',
		challenge: 'c1',
		via: 'secondFactor',
	},
});
state = stepUpReducer(state, {
	type: 'confirmed',
	answer: {
		ok: false,
		intent: 'confirm-step-up',
		error: 'invalid',
		attemptsLeft: 0,
		locked: false,
	},
});

stepUpProps(state);
// { via: 'secondFactor', attemptsLeft: 0, locked: true, error: 'invalid', pending: false, resent: false }
```

With no try left, a mailed code is over (`error: 'expired'`: ask for a new
one), and an app or a recovery code is `locked`: asking again would fail
too, so the form says to wait.

## Codes and types

The rest of `@alxia/react-router/session/model`, one line each:

```ts
import {
	HOME,
	phaseOf,
	INITIAL_STEP_UP,
	TOTP_CODE,
	type SecondFactorMethod,
	type SignInStatus,
	type StepUpConfirmAnswer,
	type StepUpProps,
	type StepUpRequestAnswer,
	type StepUpVia,
} from '@alxia/react-router/session/model';

TOTP_CODE.test('123456'); // true: six digits, nothing else
HOME; // '/', where `safeNext` falls back to
phaseOf(INITIAL_STEP_UP); // 'idle'

const method: SecondFactorMethod = 'recovery';
const status: SignInStatus = 'secondFactor';
const via: StepUpVia = 'email';
```

- `TOTP_CODE` is the regular expression of an authenticator app's code: six digits.
- `HOME` is the path `safeNext` returns when a `next` value is unsafe or missing.
- `phaseOf(state)` returns the `phase` of a step-up state.
- `SecondFactorMethod` is what a second-factor form sends: `'code' | 'recovery'`.
- `SignInStatus` is how a sign-in ended: `'signedIn' | 'secondFactor'`.
- `StepUpVia` is how a step-up is confirmed, `'email' | 'secondFactor'`, matching janus's vocabulary.
- `StepUpRequestAnswer` is what the server answers to a request for a challenge.
- `StepUpConfirmAnswer` is what the server answers to a code.
- `StepUpProps` is the shape `stepUpProps` returns; it spreads onto a step-up dialog's props.
