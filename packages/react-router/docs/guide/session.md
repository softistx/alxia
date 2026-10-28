# A BFF session

This page is for a React Router app that is the backend of its own pages (a
BFF) in front of a GraphQL API that signs users in with `@nxgt/janus`, and
holds the API's session token in an HttpOnly cookie of its own. The browser
never sees the token; the app sends it to the API as a bearer, on the user's
behalf.

It covers three subpaths:

- `@alxia/react-router/session`, the server side: the cookies, the sign-in
  flow, the step-up and the pages a mail's link opens. It imports
  `react-router` and `/errors`' files, nothing else, knows no API client and
  adds no peer.
- `@alxia/react-router/session/react`, the page's hooks around those flows:
  signing out, a mail link's parameter, a one-code field and the step-up
  with the replay of the refused action. They import
  `react` and `react-router`, both already peers.
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
- [The page's hooks](#the-pages-hooks)
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

With no `challenge` option the cookies have no challenge helpers, and `names`
holds the session alone (`SessionCookies<false>`). The challenge has its own three: `commitChallenge(challenge, expiresAt?)`,
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
import type { AlxiaContextOf } from '@alxia/react-router';

// The app's registered context: `ip` is the address alxia resolved
// (through its `proxy` option), and `language` is there when the app
// registers `@alxia/language`.
type Caller = AlxiaContextOf;

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

`stepUpSteps` and `authLinks` take such a flow as it is, with no cast. The
step-up never calls `revoke`, so it needs no `context` of its own: its
`request` and `confirm` take none.

```ts
export const stepUp = stepUpSteps({
	signIn, // the flow above, typed with `Caller`
	spent: (language) => t('step-up.spent', {}, language),
});
```

The same `context` is taken by `revokeSession(request, { context })`,
`landReplacing(answer, next, { request, context })`,
`signInStep(run, { ..., context })`, and, on `authLinks`, by
`landByLink(answer, { ..., context })` and `afterReset(request, { context })`.
A callback written with two parameters keeps working. With an explicit
`signInFlow<Lang>`, `C` stays `undefined` and a `context` is a type error:
write both type arguments (`signInFlow<Lang, Caller>`) or none (see
[the troubleshooting entry](../troubleshooting.md#type--is-not-assignable-to-type-undefined-passing-a-context-to-a-step)).

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

A second factor is optional. An API with none builds the cookies without
`challenge` and the flow without `attemptsLeft`. Neither carries a
second-factor member on its type, a `secondFactor` answer lands nowhere
(`landing` returns `null`), and no challenge cookie is set or cleared:

```ts
export const cookies = sessionCookies({ session: 'my-app_session', secure: true });
export const signIn = signInFlow({ cookies, errors, json, revoke });
// signIn.codeStep, signIn.readCodeInput and cookies.challengeOf do not exist.
```

Give both or neither: `signInFlow` refuses cookies with a challenge and no
`attemptsLeft` at compile time, and throws a TypeError at runtime when only
one is given ([troubleshooting](../troubleshooting.md)). To type a helper
that takes the flow or the cookies, use `SignInFlow<L, C, false>` and
`SessionCookies<false>` (no second factor), `SignInFlow<L, C>` and
`SessionCookies` (one), or `SignInFlow<L, C, boolean>` and
`SessionCookies<boolean>` for either. `signInFlow` itself takes
`SessionCookies<true>` or `SessionCookies<false>`, not the union: when
`challenge` may be `undefined`, `sessionCookies` returns
`SessionCookies<boolean>`, so branch on `challenge` and call `sessionCookies`
in each branch. `stepUpSteps` takes a flow with a second factor; `authLinks`
takes either. The rest of this section is for an app that has one.

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

To serve the step-up to every page from one resource route, `route(run, {
request, language })` is that whole action: it reads the same-site JSON body
and runs `run.request()` for `{ intent: 'request-step-up' }` or
`run.confirm({ challenge, code })` for `{ intent: 'confirm-step-up',
challenge, code, via? }`. Any other intent is a 400.

```ts
// app/routes/step-up.tsx: any page posts the step-up intents here
export async function action({ context, request }: Route.ActionArgs) {
	const { language } = alxiaOf(context);
	const caller = await sessionCaller(request);
	return stepUp.route(
		{
			request: async () => {
				const { requestStepUp } = await execute(RequestStepUpMutation, {}, caller);
				return { challenge: requestStepUp.challenge, via: toVia(requestStepUp.method) };
			},
			confirm: (input) => execute(ConfirmStepUpMutation, input, caller),
		},
		{ request, language },
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
{ ok: false, intent: 'confirm-step-up', error: StepUpError, attemptsLeft?, locked, message, retryAfter? }
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
| `request` refused with `MAIL_THROTTLED`, or any 429 (a rate limit) | 429 | `error: 'throttled'`, `retryAfter` in seconds when the API sent them, `message` in `wording`'s words or `errors`' |
| `confirm` refused with a 429 (a rate limit), whatever the code | 429 | `error: 'throttled'`, `locked: false`, `retryAfter` when sent: the challenge and its tries stay, wait and send the code again |

A request that the API refuses is `error: 'failed'`. A mail throttled
(`MAIL_THROTTLED`) or any refusal with the status 429 (a rate limit, under
whatever code, on `request` or on `confirm`) is `error: 'throttled'` instead, with `retryAfter`, the
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
worded for the page), `retryAfter` (a throttle's seconds, from a request or a code), `pending` and
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
// A throttled request or code (a 429) adds `error: 'throttled'` and `retryAfter` (seconds) when the API said how long:
// the challenge and its tries stay, and `VerificationCode` makes Resend wait without locking.
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

An API that refuses with several 429 codes (per address, per e-mail) gets a
countdown on each: `mailThrottled` takes a list, and every listed code
exposes its `retryAfter` to the page. The single string keeps working:

```ts
authLinks({
	signIn,
	codes: { mailThrottled: ['auth.errors.address-throttled', 'auth.errors.mail-throttled'] },
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

## The page's hooks

`@alxia/react-router/session/react` holds the client pieces every app
writes around the flows above. It imports `react` and `react-router` (peers
the package already has) and nothing else; every hook renders on the server.

### `useSignOut`

Posts `{}` as JSON to the sign-out route (the one `signIn.signOut` serves; JSON
and same-origin only), wherever the control is. `busy` is true from the call
until the navigation it starts has ended, so the button can show it.

```tsx
import { useSignOut } from '@alxia/react-router/session/react';

export function SignOutButton() {
	const { signOut, busy } = useSignOut();
	return (
		<button type="button" onClick={signOut} disabled={busy}>
			{busy ? 'Signing out…' : 'Sign out'}
		</button>
	);
}
```

Options: `action` (the route, default `/sign-out`) and `before`, run before the
post, for what must be gone from a shared device first. A `before` that throws
or rejects never keeps the user signed in: the sign-out goes on.

```tsx
const { signOut } = useSignOut({
	action: '/account/sign-out',
	before: () => caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))),
});
```

### `useLinkParam`

Reads the query parameter a mail's link carries, once: the first render's value
is kept for the page's life (unless `live: true`, below). With `drop: true` the parameter is then removed
from the address bar (`history.replaceState`, keeping the history state and the
hash), so a token is not left in the history, a bookmark or a screenshot. It is
`null` when the parameter is absent or empty.

```tsx
import { useLinkParam } from '@alxia/react-router/session/react';

export default function ResetPassword() {
	const token = useLinkParam('token', { drop: true });
	if (!token) return <p>This link is not valid. Ask for a new one.</p>;
	return (
		<form method="post">
			<input type="hidden" name="token" value={token} />
			<input type="password" name="password" autoComplete="new-password" />
			<button type="submit">Choose a new password</button>
		</form>
	);
}
```

The router's own location is not updated by `replaceState`: a loader or
`useSearchParams` elsewhere still sees the token until the next navigation.
Read it with the hook once, and pass it down.

#### `live: true`: a parameter set after the page mounted

By default the value is read once. A route that stays mounted while an action
redirects back to it with a new parameter (`/settings` to
`/settings?state=linked`) never sees it. `live: true` follows the URL: the
value is the parameter of the current location, and each new location is read
again.

```tsx
const state = useLinkParam('state', { live: true }); // 'linked' | 'invalid' | null
```

With `drop: true` too, the value is kept after the address bar loses the
parameter, until a location carries a new one: a navigation that has no such
parameter does not clear it, since the drop removed it. Without `drop` the
value is exactly the current location's parameter, `null` when it is gone.

### `useCodeField` and `useOnRefusal`

A form that asks for one code (an authenticator app's, a recovery code) and
whose action answers a refusal object when the code is wrong: on each new
refusal the refused code goes and the field takes focus, for the next try. A
refusal already there when the component mounted is the page's own and is
ignored.

`useCodeField(schema, refusal)` needs no form library. `schema` is any
[Standard Schema](https://standardschema.dev) (Zod, Valibot, ArkType; a
synchronous one). It returns `code`, `setCode`, `ref` (put it on the input),
`error` (the first message of the last `check()`, cleared by typing) and
`check()` (the parsed value, or `undefined` with `error` set).

```tsx
import { useCodeField } from '@alxia/react-router/session/react';
import { TOTP_CODE } from '@alxia/react-router/session/model';
import { Form, useActionData } from 'react-router';
import { z } from 'zod';

const schema = z.string().regex(TOTP_CODE, 'Six digits');

export function CodeForm() {
	const refusal = useActionData<object>(); // a new object on each refusal
	const field = useCodeField(schema, refusal);
	return (
		<Form method="post" onSubmit={(event) => { if (field.check() === undefined) event.preventDefault(); }}>
			<input
				ref={field.ref}
				name="code"
				inputMode="numeric"
				autoComplete="one-time-code"
				value={field.code}
				onChange={(event) => field.setCode(event.target.value)}
			/>
			{field.error ? <p role="alert">{field.error}</p> : null}
			<button type="submit">Confirm</button>
		</Form>
	);
}
```

An app on react-hook-form keeps its form and its resolver and uses the part
underneath, `useOnRefusal(refusal, handler)`, which calls `handler` once per
new refusal:

```tsx
import { useOnRefusal } from '@alxia/react-router/session/react';
import { useForm } from 'react-hook-form';

const form = useForm({ defaultValues: { code: '' } /* , resolver */ });
useOnRefusal(refusal, () => {
	form.setValue('code', '');
	form.setFocus('code');
});
```

The package takes no form library as a peer: react-hook-form would also need
its resolver for the schema, and a library-agnostic core serves every form
library at the price of three lines.

### `useStepUpReplay`

A sensitive action the API refuses with `step-up-required` answers with
`stepUp` set. `useStepUpReplay` opens the step-up on that answer, posts the
`request-step-up` and `confirm-step-up` intents, and sends the refused action
again once the session is confirmed. The dialog stays, saying so, until the
replayed action is answered; an answer that asks for a step-up again reopens
it. Cancelling forgets the step-up: a code accepted or a challenge granted
after `cancel()` is ignored and replays nothing. It is generic over your own
`post`s, so each intent keeps the fields your action types.

An action that carries a one-time code (`spendsCode`) is not replayed after a
step-up by the second factor: that code was just spent, so the dialog closes
and `confirmedNotice` is true ("confirmed, type a new code").

`route()` answers both intents from one action, so a fetcher on it has their
union as data. `requestAnswerOf(data)` and `confirmAnswerOf(data)` narrow it on
`intent` (and give `undefined` for any other answer), so each channel is typed
from the one action.

```tsx
import { useRef } from 'react';
import { useFetcher } from 'react-router';
import {
	confirmAnswerOf,
	requestAnswerOf,
	useStepUpReplay,
} from '@alxia/react-router/session/react';
import type { action as stepUpAction } from './step-up'; // the route with `stepUp.route`

type DeleteItem = { intent: 'delete-item'; id: string };

export function useDeleteItem() {
	const fetcher = useFetcher<{ ok: boolean; stepUp?: boolean }>();
	const request = useFetcher<typeof stepUpAction>({ key: 'step-up-request' });
	const confirm = useFetcher<typeof stepUpAction>({ key: 'step-up-confirm' });
	const last = useRef<DeleteItem | null>(null);

	const post = (action: DeleteItem) => {
		last.current = action;
		void fetcher.submit(action, { method: 'post', encType: 'application/json' });
	};
	const toStepUp = (body: Record<string, unknown>) =>
		void request.submit(body, {
			method: 'post',
			action: '/step-up',
			encType: 'application/json',
		});

	const stepUp = useStepUpReplay({
		answer: fetcher.state === 'idle' ? fetcher.data : undefined,
		action: last.current ?? undefined,
		replay: () => {
			if (last.current) post(last.current);
		},
		request: {
			post: () => toStepUp({ intent: 'request-step-up' }),
			answer: requestAnswerOf(request.data),
			busy: request.state !== 'idle',
			reset: () => request.reset(),
		},
		confirm: {
			post: (fields) =>
				void confirm.submit(
					{ intent: 'confirm-step-up', ...fields },
					{ method: 'post', action: '/step-up', encType: 'application/json' },
				),
			answer: confirmAnswerOf(confirm.data),
			busy: confirm.state !== 'idle',
			reset: () => confirm.reset(),
		},
	});
	return { post, ...stepUp };
}
// Pass `dialogProps` to your step-up dialog: phase, via, props, message,
// busy, confirming, onCancel, onRetry, onSubmit, onResend.
```

`dialogProps` is `dialogPropsOf(stepUp, open, cancel)`, which is plain and
exported, for a host that builds them itself.

### `useStepUp`, `asksStepUp` and `stepUpDialogPhase`

`useStepUp({ request, confirm, onConfirmed })` is the part under it, for a host
that decides itself what to do once the code is accepted. `start()` asks for a
challenge, `submit(code)` posts it, `release()` forgets everything.

```tsx
import { useStepUp } from '@alxia/react-router/session/react';

const stepUp = useStepUp({ request, confirm, onConfirmed: () => revalidate() });
// stepUp.phase: 'asking' | 'failed' | 'code' | 'expired' | 'confirmed'
```

`asksStepUp(answer)` is true for a refusal carrying `stepUp` (what opens the
dialog), and `stepUpDialogPhase(state)` is what the dialog shows for a
`stepUpReducer` state:

```ts
import { asksStepUp, stepUpDialogPhase } from '@alxia/react-router/session/react';
import { INITIAL_STEP_UP } from '@alxia/react-router/session/model';

asksStepUp({ ok: false, stepUp: true }); // true
stepUpDialogPhase(INITIAL_STEP_UP); // 'asking'
```

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
