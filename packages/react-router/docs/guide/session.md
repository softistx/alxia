# A BFF session

This page is for a React Router app that is the backend of its own pages (a
BFF) in front of a GraphQL API that signs users in with `@nxgt/janus`, and
holds the API's session token in an HttpOnly cookie of its own. The browser
never sees the token; the app sends it to the API as a bearer, on the user's
behalf.

It covers two subpaths:

- `@alxia/react-router/session`, the server side: the cookies, the sign-in
  flow, the step-up and the pages a mail's link opens. It imports
  `react-router` and `/errors`' files, nothing else, knows no API client and
  adds no peer.
- `@alxia/react-router/session/model`, the part that imports nothing and is
  safe in a component as well as in a loader: redirects that stay on the
  site, the sign-in pages' paths, and the step-up's state.

The flow speaks `@nxgt/janus`'s words (`signedIn`, `secondFactor`,
`CODE_INVALID`, `via: 'email' | 'secondFactor'`) without importing it; the app
maps its API's enums once. An app that runs `@nxgt/janus` itself, with its own
database, wants [`@alxia/janus`](https://www.npmjs.com/package/@alxia/janus)
instead.

- [A complete sign-in](#a-complete-sign-in)
- [Redirects that stay on the site](#redirects-that-stay-on-the-site)
- [The sign-in pages' paths](#the-sign-in-pages-paths)
- [Cookies](#cookies)
- [Signing in](#signing-in)
- [The second factor](#the-second-factor)
- [Signing out](#signing-out)
- [Step-up](#step-up)
- [Pages a mail's link opens](#pages-a-mails-link-opens)
- [The types and the rest of `/session/model`](#the-types-and-the-rest-of-sessionmodel)

## A complete sign-in

The app's side is three server files and four routes. `execute`, `t`,
`toAnswer`, `readViewer`, `apiMessages` and the GraphQL documents
(`SignInMutation`, `ConfirmMutation`, `RecoverMutation`, `SignOutMutation`,
`ViewerQuery`) are the app's own: the package knows no API client and no
wording. `toAnswer` maps the API's result to a `SignInAnswer` (see
[Signing in](#signing-in)).

```ts
// app/cookies.server.ts
import { sessionCookies } from '@alxia/react-router/session';

export const cookies = sessionCookies({
	session: 'my-app_session',
	challenge: 'my-app_challenge',
	secure: !import.meta.env.DEV,
});
```

```ts
// app/errors.server.ts
import { createApiErrors, jsonActions } from '@alxia/react-router/errors';

export const errors = createApiErrors<'en' | 'fr'>({
	messages: apiMessages,
	unavailable: (language) => t('app.error.unavailable', {}, language),
});
export const json = jsonActions({ origin: () => process.env.APP_ORIGIN });
```

```ts
// app/session.server.ts
import { signInFlow } from '@alxia/react-router/session';
import { SignOutMutation, execute } from './api.server';
import { cookies } from './cookies.server';
import { errors, json } from './errors.server';

export const signIn = signInFlow({
	cookies,
	errors,
	json,
	revoke: (token, request) =>
		execute(SignOutMutation, {}, { token, signal: request.signal }),
	attemptsLeft: (count, language) => t('auth.attempts-left', { count }, language),
});
```

The password page. Its loader sends a live session home and clears what a
signed-out visit should not keep; its action runs the API's mutation inside
`signInStep`, which redirects where the answer leads or stays on the form with
a message:

```tsx
// app/routes/sign-in.tsx
import { data, redirect } from 'react-router';
import { useJsonFetcher } from '@alxia/react-router/errors';
import { cookies } from '~/cookies.server';
import { json } from '~/errors.server';
import { signIn } from '~/session.server';

export async function loader({ request }: Route.LoaderArgs) {
	const viewer = await signIn.viewer(request, readViewer);
	// A live session goes home; a challenge left by a half-done sign-in goes too.
	if (viewer) {
		throw redirect(signIn.nextParam(request), {
			headers: { 'Set-Cookie': cookies.destroyChallenge() },
		});
	}
	return data({}, { headers: cookies.signInPageHeaders(viewer === null) });
}

export async function action({ context, request }: Route.ActionArgs) {
	const { language } = alxiaOf(context);
	// First, for a form posted before hydration: it goes back to its page.
	json.requireJsonPost(request);
	const input = await json.readInput(request, SignInInput);
	return signIn.signInStep(
		async () => toAnswer((await execute(SignInMutation, input)).signIn),
		{ request, language, next: signIn.nextParam(request), extra: {} },
	);
}

export default function SignIn() {
	const { fetcher, post, busy } = useJsonFetcher<typeof action>();
	return (
		<form onSubmit={(event) => { event.preventDefault(); post(formValues(event)); }}>
			{/* the fields */}
			{fetcher.data && 'formError' in fetcher.data ? <p>{fetcher.data.formError}</p> : null}
			<button disabled={busy}>Sign in</button>
		</form>
	);
}
```

The code page, reached when the answer is `secondFactor`. Its loader needs
the challenge cookie; its action posts the code against it, a recovery code
included:

```ts
// app/routes/sign-in.second-factor.tsx
import { redirect } from 'react-router';
import { signInPath } from '@alxia/react-router/session/model';
import { cookies } from '~/cookies.server';
import { signIn } from '~/session.server';

export function loader({ request }: Route.LoaderArgs) {
	if (!cookies.challengeOf(request)) {
		throw redirect(signInPath(signIn.nextParam(request)));
	}
	return null;
}

export async function action({ context, request }: Route.ActionArgs) {
	const { language } = alxiaOf(context);
	const input = await signIn.readCodeInput(request);
	const challenge = cookies.challengeOf(request);
	if (!challenge) throw redirect(signInPath(signIn.nextParam(request)));
	return signIn.signInStep(
		() =>
			signIn.codeStep(input, challenge, {
				confirm: async (challenge, code) =>
					toAnswer((await execute(ConfirmMutation, { challenge, code })).confirm),
				recover: async (challenge, recoveryCode) =>
					toAnswer((await execute(RecoverMutation, { challenge, recoveryCode })).recover),
			}),
		{
			request,
			language,
			next: signIn.nextParam(request),
			extra: { kind: input.kind },
			// A refused code stays on the form with the tries left; a challenge
			// that is over goes back to the password page.
			refused: (error) =>
				signIn.codeRefusal(error, language) ??
				redirect(signInPath(signIn.nextParam(request), { query: { expired: '1' } }), {
					headers: { 'Set-Cookie': cookies.destroyChallenge() },
				}),
		},
	);
}
```

Sign-out, and a page that needs a user:

```ts
// app/routes/sign-out.tsx
import { redirect } from 'react-router';
import { signIn } from '~/session.server';

export const loader = () => redirect('/');

export function action({ request }: Route.ActionArgs) {
	return signIn.signOut(request);
}
```

```ts
// app/routes/orders.tsx
import { data } from 'react-router';
import { signIn } from '~/session.server';

export async function loader({ request }: Route.LoaderArgs) {
	const { viewer, headers } = await signIn.requireViewer(
		request,
		(token) => execute(ViewerQuery, {}, { token }).then((r) => r.viewer),
		(viewer) => viewer.sessionExpiresAt,
	);
	return data({ viewer }, { headers });
}
```

A request with no session, or one the API refuses, is redirected to
`/sign-in?next=%2Forders`, and the user comes back to `/orders` once signed in.
The sections below say what each call does and what it refuses.

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
// app/cookies.server.ts
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
import { cookies } from './cookies.server';

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

`refreshed` never ends a session because the API sent an expiry it cannot
read: it returns `{}` for a missing or unparseable one, and the API alone
decides when a session is over.

`commit` takes the expiry as an ISO string or a `Date`, and sets `Max-Age`
to the seconds left: floored, and 0 for a past or unreadable date.

The challenge has its own three: `commitChallenge(challenge, expiresAt?)`,
`challengeOf(request)`, `destroyChallenge()`.

`cookies.names` holds the names as sent, prefixes included
(`{ session: '__Host-my-app_session', challenge: '__Secure-my-app_challenge' }`
when `secure`), for a log line, a test or a header that must name the cookie.

`signInPageHeaders(deadSession)` is what a signed-out visit of the sign-in page
sets. It clears the challenge blind: a client navigation fetches
`/sign-in.data`, which the cookie's path `/sign-in` does not match, so the
request never shows the challenge, yet a `Set-Cookie` with that path removes
it. With `deadSession`, it also removes a session cookie the API refused.

`serializeCookie(name, value, { maxAge, path?, secure })`,
`readCookie(request, name)` and `secondsUntil(expiresAt, now?)` are exported
for the cookies of your own (a language, a preference) that must be written in
the same bytes. A name that is not an RFC 6265 token, or a path with a `;` or a
control character, throws a `TypeError`; a `maxAge` that is not finite is 0.
`readCookie` returns the first non-empty cookie of that name, and `null` when
its value is not valid percent-encoding.

### Safari and `http://localhost`

Safari (WebKit) drops a `Secure` cookie set over `http://localhost`, where
Chromium and Firefox keep it. With `secure: true` in development, sign-in
succeeds and the next request carries no session, so the app loops back to the
sign-in page. Pass `secure: !import.meta.env.DEV`: development then sets no
`Secure` and no prefix, since the prefixes require `Secure`. See
[the troubleshooting entry](../troubleshooting.md#sign-in-loops-on-httplocalhost-in-safari).

## Signing in

`signInFlow` is the server side of the sign-in pages: where an answer leads,
the form's refusals, the second factor, the viewer and sign-out. Build it once
([the example](#a-complete-sign-in) does, in `app/session.server.ts`), over the
app's `createApiErrors` and `jsonActions` (the same instances its other
actions use, so every body is read with the same same-origin check).
`revoke(token, request, context)` ends a session at the API and receives the
request, for its abort signal, and [the caller's context](#the-callers-context),
for the visitor's address and language.

`toAnswer` maps the API's words to `@nxgt/janus`'s: a
`SignInAnswer` is `{ status: 'signedIn', token, expiresAt }`,
`{ status: 'secondFactor', challenge, expiresAt? }` or `{ status: 'other' }`
(an API's `LINKED`, say, which opens no session). The default codes are
janus's, `CODE_INVALID` for a wrong code and `TOKEN_UNKNOWN`, `TOKEN_SPENT`
and `TOKEN_EXPIRED` for a challenge that is gone; an API with its own pass
`codes: { invalidCode, challengeOver }`. `paths` replaces the pages' paths
(`SIGN_IN_PATHS`), `clear` lists the `Set-Cookie` values a new session and a
sign-out also remove (a per-account preference), `unavailable` words an API
that cannot be reached (`errors.unavailableMessage` by default), and
`endedParam` is a query key, such as `'expired'`, that `signInRedirect` adds
when the request carried a session cookie, to say the session ended.

A sign-in page's action runs the API's mutation inside `signInStep`, as the
example does. The order matters, because `readInput` reads the body:
`json.requireJsonPost(request)` first (a form posted before hydration goes
back to its page), then `json.readInput` (it checks the origin and the content
type, and refuses another site with a 403), then `signInStep`, which runs the
same two checks again on the headers before it signs anyone in or revokes a
session: a native post goes back to its page, and a JSON post from another
site is a 403, even for an action that read its input some other way. It reads
headers only, never the body. Its outcomes:

- A **signed-in** answer lands only when it has a token and an `expiresAt`
  that is a date still in the future; otherwise it opens no session (see
  *other* below). A session set with a dead end would be gone at once.
- A **signed-in** answer redirects to `next` (through `safeNext`) with the
  session cookie set and the challenge and the app's `clear()` cookies removed.
  The session the browser held is revoked first (`landReplacing`): one browser
  holds one session. A revoke that fails is ignored, and the old session lives
  until it expires.
- A **second factor** answer redirects to the second-factor page with the
  challenge in its own cookie. It is a secret: never in a URL, a log or the
  loader's data.
- An **API refusal** stays on the page: `{ ...extra, formError }`, worded by
  `errors`, with the API's status. An API that cannot be reached says
  `unavailable`, with 503. Anything else is thrown. `refused(error)` runs
  first: it returns a `Response` (a redirect), a string (a richer message) or
  `undefined`.
- An **other** answer opens no session, so the step says `unavailable`. Check
  an answer such as `LINKED` yourself, with `landing(answer, next)`, which is
  `null` for it.

The flow also exposes what it was built with, for the steps built on it:
`signIn.cookies`, `signIn.errors` and `signIn.json`, `signIn.attemptsLeft`,
`signIn.unavailable(language)` (the `unavailable` option, else
`errors.unavailableMessage`) and `signIn.clear()` (the `clear` option's
cookies, none by default). `stepUpSteps` and `authLinks` take the flow and read
these, so the app wires `errors`, `json` and the wording once.

`signIn.nextParam(request)` is the `next` the sign-in page was opened with,
through `safeNext`. `signIn.signInRedirect(request)` is the redirect
`requireViewer` throws: to the sign-in page, back to this request's page,
with the session cookie cleared. `signIn.revokeSession(request)` ends the
request's session at the API (through `revoke`; a failure is ignored) and
answers `true` when the request carried one.

`signIn.landing(answer, next)` and `signIn.landReplacing(answer, next,
{ request, revokeOn? })` are the same redirects for a step that does not go
through `signInStep` (a link a mail carries). `revokeOn` lists the statuses
that end the browser's session; `['signedIn']` by default.

### The caller's context

A bare `Request` carries no socket, so `revoke` cannot resolve the visitor's
address from it, and reading `X-Forwarded-For` would trust a header the browser
can forge. The address and the language come from alxia's trusted proxy
resolution, which your loader or action reads from its `context`, and which
every other call to the API already carries. Hand that to the flow: every step
that can revoke takes an optional `context`, and passes it to `revoke` as its
third argument.

Name its type with the `revoke` parameter's annotation, and `signInFlow` infers
it (`C`) for every step. Without a context, `revoke` receives `undefined`.

```ts
// app/session.server.ts
import type { alxiaOf } from '@alxia/react-router';

type Caller = ReturnType<typeof alxiaOf>;

export const signIn = signInFlow({
	cookies,
	errors,
	json,
	revoke: (token, request, caller?: Caller) =>
		execute(SignOutMutation, {}, { token, signal: request.signal, caller }),
	attemptsLeft: (count, language) => t('auth.attempts-left', { count }, language),
});

// app/routes/sign-out.ts
export async function action({ context, request }: Route.ActionArgs) {
	return signIn.signOut(request, { context: alxiaOf(context) });
}
```

The same `context` is taken by `revokeSession(request, { context })`,
`landReplacing(answer, next, { request, context })`,
`signInStep(run, { ..., context })`, and, on `authLinks`, by
`landByLink(answer, { ..., context })` and `afterReset(request, { context })`.
A callback written with two parameters keeps working. With an explicit
`signInFlow<Lang>`, TypeScript infers nothing else, so write both type
arguments (`signInFlow<Lang, Caller>`) to type the context.

### Which steps guard themselves

Every step that signs in, out, spends or mails runs the same guard before it
reads anything: a native form post is redirected back to its page, and a JSON
post from another site is a 403. These guard themselves: `signInStep`,
`readCodeInput`, `landReplacing`, `revokeSession`, `signOut` (through
`readJson`), the step-up's `request` and `confirm`, and `linkArgs`,
`spendToken`, `landByLink`, `afterReset` and `requestLink`. `landing`,
`codeStep`, `codeRefusal`, `viewer` and `requireViewer` take no post and do not.

An app's own step (a passkey's registration, say) calls `signIn.guard(request)`
first, in a POST action, before it reads the body or calls the API. It throws
the same redirect or 403. Do not call it in a GET callback (an OAuth return, a
magic link's landing): a GET carries no JSON content type, so the guard would
redirect it to itself.

### The viewer

```ts
// a page that needs a user (as in the example)
const { viewer, headers } = await signIn.requireViewer(
	request,
	(token) => execute(ViewerQuery, {}, { token }).then((r) => r.viewer),
	(viewer) => viewer.sessionExpiresAt,
);
return data({ viewer }, { headers });

// the sign-in page itself: a live session goes home
const viewer = await signIn.viewer(request, read); // the viewer, null, or undefined
```

`requireViewer` throws `signInRedirect(request)` without a cookie, on a 401
and when `read` finds no viewer; any other failure is thrown through
`routeError`. The redirect comes back to the page and clears the cookie, and
adds `?<endedParam>=1` when the request carried one. `headers` set the cookie
again when the API moved the session's end. `viewer` answers `null` for a
401 (a dead session: send `cookies.signInPageHeaders(true)`), and `undefined`
without a cookie or when the API cannot tell.

## The second factor

The sign-in page's answer `secondFactor` leads to the second-factor page,
whose loader needs the challenge cookie (`cookies.challengeOf(request)`; back
to the sign-in page without one) and whose action posts the code.

[The example](#a-complete-sign-in) shows both: `codeStep` runs `confirm` for an
issued code and `recover` for a recovery code, and `refused` words a refusal
with the tries left or, when the challenge is over, sends the user back to the
password page.

`readCodeInput` takes the page's JSON post, `{ kind, code }`: `kind` is
`'code'` for an issued code (an authenticator app's, or the one mailed) and
`'recovery'` for a recovery code (`SecondFactorKind`); `code` is at most 40
characters. A native form post (before hydration) goes back to its page, a
cross-site post is a 403 even when it is JSON, and a body of another shape is a
400.

`codeRefusal(error, language, whenNone?)` words a refused code:

| the API says | the form shows |
| --- | --- |
| `CODE_INVALID` with `attemptsLeft: 3` | the message and `attemptsLeft(3, language)` |
| `CODE_INVALID` with `attemptsLeft: 0` | `undefined`: the challenge is over, sign in again (with `whenNone`, the message and `whenNone` instead) |
| `CODE_INVALID` with no count | the message alone |
| `TOKEN_UNKNOWN`, `TOKEN_SPENT`, `TOKEN_EXPIRED` | `undefined` |
| anything else | the message `errors` words |

The count is `attemptsLeftOf(error)` of
[`@alxia/react-router/errors`](errors.md#the-tries-a-code-leaves), which
reads janus's `extensions.attemptsLeft`.

## Signing out

`signIn.signOut(request)` is the whole action of the example's sign-out route.

`signOut` reads the body as JSON first (same-origin only, a 403 or 415
otherwise), so another site cannot sign anyone out, and a GET signs nobody
out. It then ends the session at the API (a failure is ignored: the cookie
goes anyway), removes the session cookie, the challenge cookie and the app's
`clear()` cookies and
redirects to `${paths.signIn}?signed-out=1` (`/sign-in?signed-out=1` by
default). `signOut(request, { to })` redirects to `to` instead, after `safeNext`: a value that leaves the site goes to `/`.

## Step-up

A step-up is a code asked for before a sensitive action: the API refuses the
mutation with `STEP_UP_REQUIRED`, the page asks for a challenge
(`requestStepUp`), the user reads the code (in the mail, or in their
authenticator app) and the page confirms it (`confirmStepUp`). `stepUpSteps`
is the server half: two steps for the route's action, whose answers
[`stepUpReducer`](#the-state-on-the-page) takes as they are.

```ts
// app/step-up.server.ts
import { stepUpSteps } from '@alxia/react-router/session';
import { signIn } from './session.server';

export const stepUp = stepUpSteps({
	// The app's signInFlow: the step-up reads its errors, its json (a step runs
	// for a same-site JSON post only) and its attemptsLeft.
	signIn,
	spent: (language) => t('step-up.spent', {}, language), // "Ask for a new code."
	locked: (language) => t('step-up.locked', {}, language), // "Wait a few minutes."
});
```

`json.readJson`, `toVia`, `execute` and `sessionCaller` below are the app's
own helpers (its `jsonActions`, its mapping of the API's method to `via`, its
GraphQL call and its session caller), not this package's.

```ts
// app/routes/account.step-up.tsx
import { stepUp } from '~/step-up.server';

export async function action({ context, request }: Route.ActionArgs) {
	const { language } = alxiaOf(context);
	json.requireJsonPost(request); // a native post goes back to its page
	const caller = await sessionCaller(request);
	const input = await json.readJson(request); // same-origin JSON only
	if (input.intent === 'request-step-up') {
		return stepUp.request(
			async () => {
				const { requestStepUp } = await execute(RequestStepUpMutation, {}, caller);
				return { challenge: requestStepUp.challenge, via: toVia(requestStepUp.method) };
			},
			{ request, language },
		);
	}
	const via = input.via === 'email' || input.via === 'secondFactor' ? input.via : undefined;
	return stepUp.confirm(
		() =>
			execute(ConfirmStepUpMutation, { challenge: input.challenge, code: input.code }, caller),
		{ request, language, via },
	);
}
```

`request(run, { request, language })` answers `{ ok: true,
intent: 'request-step-up', challenge, via }`. `confirm(run, { request,
language, via? })` answers `{ ok: true, intent: 'confirm-step-up' }`. Both
first run the same guard as `signInStep`: a form posted before hydration goes
back to its page, and a JSON post from another site is a 403, before `run`
is called. `via` may be `undefined`. A refusal stays on the page, with the
API's status, as `data(...)`:

```ts no-check
type StepUpError = 'invalid' | 'expired' | 'failed' | 'throttled';

// request, refused
{ ok: false, intent: 'request-step-up', error: StepUpError, message, retryAfter? }
// confirm, refused
{ ok: false, intent: 'confirm-step-up', error: StepUpError, attemptsLeft?, locked, message }
```

The answer must not be cached: `Cache-Control: private, no-store`, which
`@alxia/secure-headers`' `pageHeaders` sets.

A refused request reaches the UI as `error` (`'failed'`, or `'throttled'` for a
mail held back) with `message`, the refusal worded for the page. The reducer
keeps both: `state.message` until the next step, and `state.retryAfter` for a
throttle whose seconds the API gave.

The `via` of `confirm` is the one `request` answered, which the page holds
(the reducer's state has it). The `run` function of `confirm` takes nothing:
bind the challenge and the code in it, as above, and keep the step's `intent`
out of the API's variables.

**The challenge stays in the fetcher's answer.** It is a secret: never put it
in a URL, in a cookie, in the loader's data or in a log. The page keeps it in
the reducer's state and posts it back with the code. A page that carries it in
the loader would keep it in the browser's history and the caches.

### What each answer leads to

This is the table of `@nxgt/janus-graphql`'s `confirmStepUp`, with what
`confirm` answers:

| the API says | status | `confirm` answers |
| --- | --- | --- |
| accepted | 200 | `{ ok: true }`: send the refused mutation again |
| `CODE_INVALID`, `attemptsLeft: 3` | 401 | `error: 'invalid'`, `attemptsLeft: 3`, `locked: false`: ask for the code again |
| `CODE_INVALID`, `attemptsLeft: 0`, `via: 'email'` | 401 | `error: 'expired'`, `locked: false`: ask for a new code |
| `CODE_INVALID`, `attemptsLeft: 0`, `via: 'secondFactor'` (an app or a recovery code) | 401 | `error: 'invalid'`, `attemptsLeft: 0`, `locked: true`, `message` ends with `locked`'s words: wait, a new code would fail the same way |
| `TOKEN_SPENT`, `TOKEN_EXPIRED`, `TOKEN_UNKNOWN`, `TOKEN_STALE` | 400 | `error: 'expired'`: ask for a new code |
| `SECOND_FACTOR_ACTIVE`, `SECOND_FACTOR_NOT_ENROLLED` | 409 | `error: 'expired'`: start over, the way to confirm changed |
| `USER_INACTIVE`, anything else | 403 or other | `error: 'failed'`, in `wording`'s words or `errors`' |
| an API it cannot reach | 503 | `error: 'failed'` |
| `request` refused with `MAIL_THROTTLED` | 429 | `error: 'throttled'`, `retryAfter` in seconds when the API sent them, `message` in `wording`'s words or `errors`' |

A request that the API refuses is `error: 'failed'`. A mail throttled
(`MAIL_THROTTLED`, 429) is `error: 'throttled'` instead, with `retryAfter`, the
whole seconds to wait, read from `extensions.params.retryAfter` or
`extensions.retryAfter` (a number or a numeric string, rounded up; with none
usable the answer is still `throttled`, without `retryAfter`). Its `message`
is worded by the `wording` option, which sees the error before `errors` does,
so it can say the wait:

```ts
import { waitMinutes } from '@alxia/react-router/errors';

stepUpSteps({
	// …
	wording: (error, language) =>
		error.code === 'MAIL_THROTTLED'
			? t('mail.wait', { minutes: waitMinutes(error.errors[0]?.extensions) }, language)
			: undefined,
});
```

With no try left, an app's code is the account's shared lockout (janus counts
the codes of a step-up, of a factor's regeneration and of its disabling
together): a new challenge would be refused too, so `confirm` says `locked`
and the form says to wait. A mailed code at that point is over, and asking
again works. With no `via`, `confirm` reads a mailed code.

`stepUp.isStepUpRequired(error)` is true for the API's `STEP_UP_REQUIRED`
refusal of a sensitive mutation, so an action can answer the page with the
request for a challenge instead of the error page.

### The codes it tells apart

`codes` takes `invalidCode` (`'CODE_INVALID'`), `challengeOver` (the table's
codes that end a challenge; passing a list replaces it), `stepUpRequired`
(`'STEP_UP_REQUIRED'`) and `mailThrottled` (`'MAIL_THROTTLED'`).
`STEP_UP_OVER` is `[...CHALLENGE_OVER, …]`, so a list that adds a code of its
own can spread either. `invalidCode` in `challengeOver` is a
[`TypeError`](../troubleshooting.md#typeerror-stepupsteps-the-code--is-both-the-wrong-code-code-codesinvalidcode-and-in-codeschallengeover-a-wrong-code-that-leaves-tries-cannot-end-the-challenge).

### Call the step-up with a caller that does not sign out on a 401

`@nxgt/janus-graphql` answers a wrong code (`CODE_INVALID`) with HTTP 401. A
caller that treats every 401 as "the session is dead" and redirects to the
sign-in page would sign the user out on the first typo. Make the caller of the
step-up's two operations leave a 401 alone, or have it redirect only when the
error's code is `UNAUTHENTICATED`.

### The state on the page

A step-up asks for a code before a sensitive action. `stepUpReducer` holds
its state on the page, with no React: `phase` (`idle`, `requesting`, `code`,
`confirming`, `done`), the `via` that confirms it (`email` or
`secondFactor`), the `challenge` held, `attemptsLeft`, `locked`, `error`
(`invalid`, `expired`, `failed` or `throttled`), `message` (the last refusal
worded for the page), `retryAfter` (a throttle's seconds), `pending` and
`resent`. `start`, `submit`, an accepted answer and `release` clear `message`
and `retryAfter`.

`stepUpProps(state)` gives the part a code form shows (not the challenge, a
secret that stays out of the markup, and not `message`: the dialog words its
own texts from `error`, `attemptsLeft`, `locked` and `retryAfter`):

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
// A throttled request adds `retryAfter` (seconds) when the API said how long.
```

With no try left, a mailed code is over (`error: 'expired'`: ask for a new
one), and an app or a recovery code is `locked`: asking again would fail
too, so the form says to wait.

## Pages a mail's link opens

A magic link, a password reset or an invitation opens a page whose URL
carries a token. `authLinks` is the server side of those pages, built once
beside the app's `signInFlow`:

```ts
// app/links.server.ts
import { authLinks } from '@alxia/react-router/session';
import { signIn } from './session.server';

export const links = authLinks({
	// The app's signInFlow: the links use its cookies, its errors and its json
	// (every body is read with the same CSRF check).
	signIn,
	start: async (token) => (await homeOf(token)) ?? '/', // optional
});
```

`homeOf`, `viewerOf`, `confirmMagicLink` and `toAnswer` below are the app's
own: its GraphQL calls and its mapping of the API's enums to a `SignInAnswer`.
`ConfirmArgs` is any Standard Schema; a Zod 4 stub:

```ts
import { z } from 'zod';

const ConfirmArgs = z.object({ token: z.string().max(200) });
```

```tsx
// app/routes/auth/magic-link.tsx
import { data } from 'react-router';
import { TOKEN_PAGE_HEADERS } from '@alxia/react-router/session';

const PATH = '/auth/magic-link';

export const headers = () => TOKEN_PAGE_HEADERS;

export async function loader({ request }: Route.LoaderArgs) {
	// Spends nothing: a mail scanner opens links first.
	return data({ signedInAs: (await viewerOf(request))?.name ?? null }, { headers: TOKEN_PAGE_HEADERS });
}

export async function action({ request }: Route.ActionArgs) {
	const { token } = await links.linkArgs(ConfirmArgs, request, PATH);
	const spent = await links.spendToken(() => confirmMagicLink(token), {
		request,
		language: 'en',
		path: PATH,
		states: { 'auth.errors.invalid-token': 'invalid' },
	});
	if (!spent.ok) return links.answerOf(spent);
	return links.landByLink(toAnswer(spent.value), {
		request,
		language: 'en',
		// The API's LINKED opens no session: end on the page's `linked` state.
		other: { path: PATH, state: 'linked' },
	});
}
```

Asking for the mail, and the reset's last step:

```ts
// app/routes/auth/sign-in-link.tsx
export async function action({ request }: Route.ActionArgs) {
	json.requireJsonPost(request); // a native post goes back to its page
	const { email } = await json.readInput(request, EmailArgs);
	return links.requestLink(() => requestMagicLink(email), {
		request,
		language: 'en',
	});
}

// app/routes/auth/reset-password.tsx, once the new password is set
export async function action({ request }: Route.ActionArgs) {
	// ... linkArgs, spendToken ...
	return links.afterReset(request); // to /sign-in?password-reset=1
}
```

- `TOKEN_PAGE_HEADERS` is `Referrer-Policy: no-referrer` and
  `X-Robots-Tag: noindex, nofollow`: no `Referer` carries the token to another
  site (a font, an image), and no search engine keeps the page. Set them on
  the page's document and its `.data` responses. The redirects of `ended`,
  `landByLink` and `afterReset` carry them already.
- `linkArgs(schema, request, path)` first refuses a post that is not a
  same-site JSON one (a form posted before hydration goes back to its page, a
  cross-site post is a 403), reads the request as JSON with `json.readJson`
  and checks it against any Standard Schema
  (Zod 4, Valibot, ArkType; async is fine). An issue on `token` (missing, or
  over the API's limit: a link cut or padded on its way) throws the redirect
  to the `invalid` end state, as an unknown token does; any other issue throws
  a 400. `invalidState` names another state.
- `spendToken(run, { request, language, path, states, fields })` runs the API
  call that spends the token, after the same guard on `request`. It returns `{ ok: true, value }`, or what the page answers:
  an API code in `states` ends the page on that state (the redirect replaces
  the token's history entry); refused `fields` stay under the form fields the
  page shows; any other refusal, a wait or an unreachable API, is the form's
  message with the API's status. `answerOf(spent)` turns the refusal into the
  action's answer. Anything that is not an API refusal is rethrown.
- `statePath(path, state)` is `path?state=…`: the token page in an end state,
  with no token. `ended(path, state, headers?)` is the redirect to it, replacing
  the token's history entry (React Router's `replace`), so Back never opens
  the token's URL again.
- `landByLink(answer, { request, language, other? })` signs the link in. The
  session the browser held, whoever's, is revoked first (one browser holds one
  session), on a `secondFactor` answer as well as a `signedIn` one. A signed-in
  answer whose session is still live goes to `start(token, request)`'s path
  (`/` when `start` is missing, throws, or answers a path off the site), so the
  redirect lands at once instead of pushing a history entry after `/`'s own
  redirect. An answer that leads nowhere (a session already ended included)
  is the form's `unavailable` with a 503. An `other` answer is one too, unless
  `other: { path, state }` is given: an app whose API can answer "linked" (no
  session opened) passes the page and its state, and the answer ends there,
  keeping the browser's session.
- `afterReset(request)` follows a password reset, which signs the account out
  everywhere: the browser's session is revoked and its session cookie, its
  challenge cookie and the flow's `clear()` cookies are cleared, then
  the page replaces the token's entry with `resetDone` (`/sign-in?password-reset=1`
  by default).
- `requestLink(run, { request, language })` requests the mail. It answers
  `{ sent: true }` whoever the address is, so the page does not tell which
  addresses hold an account (`RequestLinkAnswer` is its shape). A wait is a
  429 with the `formError`, `throttled: true` and, when the API gave the
  seconds, a typed `retryAfter` beside it; a malformed address is the `email` field's refusal.

`linkArgs`, `spendToken`, `landByLink`, `afterReset` and `requestLink` first
refuse a post that is not a same-site JSON one: the redirect a native form
post gets goes back to its page, which then posts JSON, and a JSON post from
another site is a 403, before anything is read, spent, revoked or landed.

The wait is recognised by the app's own throttle code, so pass it, as the
step-up's `codes` and `wording` do (`AuthLinksCodes` is the type of `codes`).
`wording` words every refusal of `requestLink` that is not a field's, the
wait included; returning `undefined` keeps `errors`' words:

```ts
authLinks({
	signIn,
	codes: { mailThrottled: 'auth.errors.too-many-attempts' }, // 'MAIL_THROTTLED' by default
	wording: (error, language) => waitMessage(error, language), // else the catalogue's
});
```

A token is never logged, worded in an error or put in a redirect built by the
helpers: the end states and the sign-in's redirects carry a state or a path
alone, and a `TypeError` about a path prints it only up to its `?` or `#`.
`statePath`, `ended`, `linkArgs` and `spendToken` throw that `TypeError` for a
page `path` with a query, a fragment or a host (naming the call), and
`authLinks` throws one for a `resetDone` that leaves the site.

One redirect does carry the page's URL as it was: the native post (a form
submitted before hydration) that `linkArgs`, `landByLink`, `afterReset`,
`requestLink` and `spendToken` send back to the token page itself. It is
harmless because it goes only to the URL the browser already holds, on this
site, as a GET that spends nothing; the token is no further from the user than
it was in the address bar, and the page's `TOKEN_PAGE_HEADERS` still keep it
out of any `Referer`.

## The types and the rest of `/session/model`

The rest of `@alxia/react-router/session/model`, beside `safeNext`,
`signInPath` and the step-up's reducer above:

```ts
import {
	HOME,
	INITIAL_STEP_UP,
	TOTP_CODE,
	type SecondFactorKind,
	type SignInStatus,
	type SignInPaths,
	SIGN_IN_PATHS,
	type StepUpConfirmAnswer,
	type StepUpProps,
	type StepUpRequestAnswer,
	type StepUpVia,
} from '@alxia/react-router/session/model';

TOTP_CODE.test('123456'); // true: six digits, nothing else
HOME; // '/', where `safeNext` falls back to
INITIAL_STEP_UP.phase; // 'idle'
SIGN_IN_PATHS.signIn; // '/sign-in'

const paths: SignInPaths = { ...SIGN_IN_PATHS, signIn: '/login' };
const kind: SecondFactorKind = 'recovery';
const status: SignInStatus = 'secondFactor';
const via: StepUpVia = 'email';
```

- `TOTP_CODE` is the regular expression of an authenticator app's code: six digits.
- `HOME` is the path `safeNext` returns when a `next` value is unsafe or missing.
- `SIGN_IN_PATHS` and `SignInPaths` are the sign-in pages' paths and their
  type: `{ signIn, secondFactor }`.
- `SecondFactorKind` is what a second-factor form sends: `'code' | 'recovery'`.
- `SignInStatus` is how a sign-in ended: `'signedIn' | 'secondFactor'`.
- `StepUpVia` is how a step-up is confirmed, `'email' | 'secondFactor'`, matching janus's vocabulary.
- `StepUpRequestAnswer` is what the server answers to a request for a challenge, with the `message` of a refusal and a throttle's `retryAfter`.
- `StepUpConfirmAnswer` is what the server answers to a code, with the `message` `stepUpSteps` words.
- `StepUpError` is `'invalid' | 'expired' | 'failed' | 'throttled'`.
- `StepUpProps` is the shape `stepUpProps` returns (`via`, `attemptsLeft`, `locked`, `error`, `retryAfter`, `pending`, `resent`); it spreads onto a step-up dialog's props.

The types of `/session`:

- `SignInAnswer` is what a step answers: `signedIn`, `secondFactor` or `other`.
- `SignInFlowOptions` is what `signInFlow` takes, `SignInFlow` what it returns.
- `SignInCodes` is its `codes` option: `invalidCode` and `challengeOver`.
- `SignInFormError<T>` is `T & { formError: string }`, a form step's answer
  when it stays on the page, and `SignInStayed<T>` is `signInStep`'s
  `data(...)` return for it, with the status.
- `SessionCookies`, `SessionCookiesOptions` and `CookieSession` are the cookies,
  their options and a session read from a request (`{ token, expiresAt }`).
- `StepUpStepsOptions` is what `stepUpSteps` takes, `StepUpSteps` what it returns.
- `StepUpCodes` is the `codes` option.
- `StepUpStayed<T>` is a step's `data(...)` return for an answer that stays on the page.
- `StepUpCall<L>` is the `{ request, language }` each step-up step takes.
- `INVALID_CODE`, `CHALLENGE_OVER`, `STEP_UP_OVER`, `STEP_UP_REQUIRED` and
  `MAIL_THROTTLED` are the default codes, so an app can extend a list
  (`challengeOver: [...CHALLENGE_OVER, 'auth.errors.gone']`).
- `AuthLinksOptions` is what `authLinks` takes: `signIn`, and the optional
  `codes` (`AuthLinksCodes`: `mailThrottled`), `wording`, `start`, `resetDone`
  and `invalidState`. `AuthLinks` is what it returns.
- `Spent<T>` is what `spendToken` returns, `LinkStayed` is the `data(...)` a
  refusal answers with, and `SpendOptions` is its second argument.
