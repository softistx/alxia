# A BFF session

This page is for an app that is the backend of its own pages (a BFF) and
calls a GraphQL API that signs users in. It grows with
`@alxia/react-router/session`, whose code imports `react-router` and `/errors`
alone, and `@alxia/react-router/session/model`, the part that imports
nothing and is safe in a component as well as in a loader.

- [Redirects that stay on the site](#redirects-that-stay-on-the-site)
- [The sign-in pages' paths](#the-sign-in-pages-paths)
- [Cookies](#cookies)
- [Signing in](#signing-in)
- [The second factor](#the-second-factor)
- [Signing out](#signing-out)
- [The step-up state](#the-step-up-state)
- [Codes and types](#codes-and-types)
- [Step-up](#step-up)
- [Pages a mail's link opens](#pages-a-mails-link-opens)

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

## Signing in

`signInFlow` is the server side of the sign-in pages: where an answer leads,
the form's refusals, the second factor, the viewer and sign-out. Build it once,
beside the cookies, over the app's `createApiErrors` and `jsonActions` (the
same instances its other actions use, so every body is read with the same
same-origin check):

```ts
// app/session.server.ts
import { signInFlow } from '@alxia/react-router/session';
import { cookies } from './cookies.server';
import { errors, json } from './errors.server';
import { SignOutMutation, execute } from './api.server';

export const signIn = signInFlow({
	cookies,
	errors,
	json,
	revoke: (token, request) =>
		execute(SignOutMutation, {}, { token, signal: request.signal }),
	attemptsLeft: (count, language) => t('auth.attempts-left', { count }, language),
});
```

`execute`, `t`, `toAnswer` and the mutation and query documents in these
examples (`SignOutMutation`, `SignInMutation`, `ViewerQuery`, …) are the
app's own: the package knows no API client and no wording. `toAnswer` maps
the API's result to a `SignInAnswer`. `revoke(token, request)` receives the
request, for the caller's language, address or abort signal.

The flow speaks `@nxgt/janus`'s words, and the app maps its API's: a
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

A sign-in page's action runs the API's mutation inside `signInStep`. Read
the body through `json` first (`json.readInput` checks the origin and the
content type): `signInStep` itself refuses a post that is not JSON, by
redirecting it back to its page, so a form another site posts can neither
sign anyone in nor revoke a session. It reads headers only, never the body.

```ts
// app/routes/sign-in.tsx
import { json } from '~/errors.server';
import { signIn } from '~/session.server';

export async function action({ context, request }: Route.ActionArgs) {
	const { language } = alxiaOf(context);
	const input = await json.readInput(request, SignInInput);
	return signIn.signInStep(
		async () => toAnswer((await execute(SignInMutation, input)).signIn),
		{ request, language, next: signIn.nextParam(request), extra: {} },
	);
}
```

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

### The viewer

```ts
// a page that needs a user
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
to the sign-in page without one) and whose action posts the code:

```ts
// app/routes/sign-in.second-factor.tsx
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
			refused: (error) =>
				signIn.codeRefusal(error, language) ??
				redirect(signInPath(signIn.nextParam(request), { query: { expired: '1' } }), {
					headers: { 'Set-Cookie': cookies.destroyChallenge() },
				}),
		},
	);
}
```

`readCodeInput` takes the page's JSON post, `{ kind, code }`: `kind` is
`'code'` for an issued code (an authenticator app's, or the one mailed) and
`'recovery'` for a recovery code (`SecondFactorMethod`); `code` is at most 40
characters. A native form post (before hydration) goes back to its page, a
cross-site post is a 403, and a body of another shape is a 400.

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

```ts
// app/routes/sign-out.tsx
export const loader = () => redirect('/');

export function action({ request }: Route.ActionArgs) {
	return signIn.signOut(request);
}
```

`signOut` reads the body as JSON first (same-origin only, a 403 or 415
otherwise), so another site cannot sign anyone out, and a GET signs nobody
out. It then ends the session at the API (a failure is ignored: the cookie
goes anyway), removes the session cookie and the app's `clear()` cookies and
redirects to `${paths.signIn}?signed-out=1` (`/sign-in?signed-out=1` by default). `signOut(request, { to })` redirects to
`to` instead, after `safeNext`: a value that leaves the site goes to `/`.

### The flow's types

- `SignInAnswer` is what a step answers: `signedIn`, `secondFactor` or `other`.
- `SignInFlowOptions` is what `signInFlow` takes.
- `SignInFlow` is what it returns.
- `SignInCodes` is the `codes` option: `invalidCode` and `challengeOver`.
- `SignInFormError<T>` is `T & { formError: string }`, a form step's answer
  when it stays on the page.
- `SignInStayed<T>` is `signInStep`'s `data(...)` return for it, with the status.

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
- `StepUpRequestAnswer` is what the server answers to a request for a challenge, with the `message` of a refusal.
- `StepUpConfirmAnswer` is what the server answers to a code, with the `message` `stepUpSteps` words.
- `StepUpProps` is the shape `stepUpProps` returns; it spreads onto a step-up dialog's props.

## Step-up

A step-up is a code asked for before a sensitive action: the API refuses the
mutation with `STEP_UP_REQUIRED`, the page asks for a challenge
(`requestStepUp`), the user reads the code (in the mail, or in their
authenticator app) and the page confirms it (`confirmStepUp`). `stepUpSteps`
is the server half: two steps for the route's action, whose answers
[`stepUpReducer`](#the-step-up-state) takes as they are.

```ts
// app/core/session/server/step-up.server.ts
import { stepUpSteps } from '@alxia/react-router/session';

export const stepUp = stepUpSteps({
	errors,
	attemptsLeft: (count, language) => t('code.attempts-left', { count }, language),
	spent: (language) => t('step-up.spent', {}, language), // "Ask for a new code."
	locked: (language) => t('step-up.locked', {}, language), // "Wait a few minutes."
});
```

`json.readJson`, `toVia`, `execute` and `sessionCaller` below are the app's
own helpers (its `jsonActions`, its mapping of the API's method to `via`, its
GraphQL call and its session caller), not this package's.

```ts
// app/routes/account.step-up.tsx
export async function action({ context, request }: Route.ActionArgs) {
	const { language } = alxiaOf(context);
	const caller = await sessionCaller(request);
	const input = await json.readJson(request); // same-origin JSON only
	if (input.intent === 'request-step-up') {
		return stepUp.request(async () => {
			const { requestStepUp } = await execute(RequestStepUpMutation, {}, caller);
			return { challenge: requestStepUp.challenge, via: toVia(requestStepUp.method) };
		}, language);
	}
	const via = input.via === 'email' || input.via === 'secondFactor' ? input.via : undefined;
	return stepUp.confirm(
		() =>
			execute(ConfirmStepUpMutation, { challenge: input.challenge, code: input.code }, caller),
		via ? { via } : {},
		language,
	);
}
```

`request(run, language)` answers `{ ok: true, intent: 'request-step-up',
challenge, via }`. `confirm(run, { via }, language)` answers `{ ok: true,
intent: 'confirm-step-up' }`. A refusal stays on the page, with the API's
status, as `data(...)`:

```ts no-check
type StepUpError = 'invalid' | 'expired' | 'failed';

// request, refused
{ ok: false, intent: 'request-step-up', error: 'failed', message }
// confirm, refused
{ ok: false, intent: 'confirm-step-up', error: StepUpError, attemptsLeft?, locked, message }
```

The answer must not be cached: `Cache-Control: private, no-store`, which
`@alxia/secure-headers`' `pageHeaders` sets.

A refused request (`error: 'failed'`) reaches the UI through
`fetcher.data.message`: a throttled mail's wait is only there, since the
reducer keeps `error` but not `message`.

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

A request that the API refuses is `error: 'failed'`: a mail throttled
(`MAIL_THROTTLED`, 429) is worded by the `wording` option, which sees the
error before `errors` does, so it can say the wait:

```ts
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
codes that end a challenge; passing a list replaces it) and `stepUpRequired`
(`'STEP_UP_REQUIRED'`). `invalidCode` in `challengeOver` is a
[`TypeError`](../troubleshooting.md#typeerror-stepupsteps-the-code--is-both-the-wrong-code-code-codesinvalidcode-and-in-codeschallengeover-a-wrong-code-that-leaves-tries-cannot-end-the-challenge).

### Call the step-up with a caller that does not sign out on a 401

`@nxgt/janus-graphql` answers a wrong code (`CODE_INVALID`) with HTTP 401. A
caller that treats every 401 as "the session is dead" and redirects to the
sign-in page would sign the user out on the first typo. Make the caller of the
step-up's two operations leave a 401 alone, or have it redirect only when the
error's code is `UNAUTHENTICATED`.

### The step-up's types

- `StepUpStepsOptions` is what `stepUpSteps` takes, `StepUpSteps` what it returns.
- `StepUpCodes` is the `codes` option.
- `StepUpStayed<T>` is a step's `data(...)` return for an answer that stays on the page.
- `STEP_UP_OVER` and `STEP_UP_REQUIRED` are the default codes.

## Pages a mail's link opens

A magic link, a password reset or an invitation opens a page whose URL
carries a token. `authLinks` is the server side of those pages, built once
beside the app's `signInFlow`:

```ts
// app/session.server.ts
import { authLinks } from '@alxia/react-router/session';

export const links = authLinks({
	signIn, // the app's signInFlow
	cookies, // the same sessionCookies
	errors, // the app's createApiErrors
	start: async (token) => (await homeOf(token)) ?? '/', // optional
});
```

```tsx
// app/routes/auth/magic-link.tsx
import { data } from 'react-router';
import { TOKEN_PAGE_HEADERS } from '@alxia/react-router/session';

const PATH = '/auth/magic-link';

export async function loader({ request }: Route.LoaderArgs) {
	// Spends nothing: a mail scanner opens links first.
	return data({ signedInAs: (await viewerOf(request))?.name ?? null }, { headers: TOKEN_PAGE_HEADERS });
}

export const headers = () => TOKEN_PAGE_HEADERS;

export async function action({ request }: Route.ActionArgs) {
	const { token } = await links.linkArgs(ConfirmArgs, await json.readJson(request), PATH);
	const spent = await links.spendToken(() => confirmMagicLink(token), {
		language: 'en',
		path: PATH,
		states: { 'auth.errors.invalid-token': 'invalid' },
	});
	if (!spent.ok) return links.answerOf(spent);
	if (spent.value.status === 'LINKED') return links.ended(PATH, 'linked');
	return links.landByLink(toAnswer(spent.value), { request, language: 'en' });
}
```

- `TOKEN_PAGE_HEADERS` is `Referrer-Policy: no-referrer` and
  `X-Robots-Tag: noindex, nofollow`: no `Referer` carries the token to another
  site (a font, an image), and no search engine keeps the page. Set them on
  the page's document and its `.data` responses.
- `linkArgs(schema, body, path)` checks what the page posted against any
  Standard Schema (Zod 4, Valibot, ArkType; async is fine). An issue on
  `token` (missing, or over the API's limit: a link cut or padded on its way)
  throws the redirect to the `invalid` end state, as an unknown token does;
  any other issue throws a 400. `invalidState` names another state.
- `spendToken(run, { language, path, states, fields })` runs the API call that
  spends the token. It returns `{ ok: true, value }`, or what the page answers:
  an API code in `states` ends the page on that state (the redirect replaces
  the token's history entry); refused `fields` stay under the form fields the
  page shows; any other refusal, a wait or an unreachable API, is the form's
  message with the API's status. `answerOf(spent)` turns the refusal into the
  action's answer. Anything that is not an API refusal is rethrown.
- `statePath(path, state)` is `path?state=…`: the token page in an end state,
  with no token. `ended(path, state, headers?)` is the redirect to it, replacing
  the token's history entry (React Router's `replace`), so Back never opens
  the token's URL again.
- `landByLink(answer, { request, language })` signs the link in. The session
  the browser held, whoever's, is revoked first (one browser holds one
  session), on a `secondFactor` answer as well as a `signedIn` one. A signed-in
  answer goes to `start(token, request)`'s path (`/` when `start` is missing,
  throws, or answers a path off the site), so the redirect lands at once
  instead of pushing a history entry after `/`'s own redirect. An answer that
  leads nowhere is the form's `unavailable` with a 503. An answer of
  `other` is one too: an app whose API can answer "linked" (no session
  opened) tests it first and answers `ended(path, 'linked')`, which keeps the
  browser's session.
- `afterReset(request)` follows a password reset, which signs the account out
  everywhere: the browser's session is revoked and its cookie cleared, then
  the page replaces the token's entry with `resetDone` (`/sign-in?password-reset=1`
  by default).
- `requestLink(run, language)` requests the mail. It answers `{ sent: true }`
  whoever the address is, so the page does not tell which addresses hold an
  account. A wait (`throttled.code`, `MAIL_THROTTLED` by default, worded by
  `throttled.wording` or the catalogue) is a 429, and a malformed address is
  the `email` field's refusal.

A token is never logged, worded in an error or put in a redirect: the end
states and the sign-in's redirects carry a state or a path alone. Every path
the helpers redirect to is checked first: `statePath` throws a `TypeError` for a
page `path` with a query, a fragment or a host, and `authLinks` throws one for
a `resetDone` that leaves the site.
