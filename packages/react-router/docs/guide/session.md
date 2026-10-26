# A BFF session

This page is for an app that is the backend of its own pages (a BFF) and
calls a GraphQL API that signs users in. It grows with
`@alxia/react-router/session`; today it covers the part that imports
nothing, `@alxia/react-router/session/model`, which is safe in a component
as well as in a loader.

- [Redirects that stay on the site](#redirects-that-stay-on-the-site)
- [The sign-in pages' paths](#the-sign-in-pages-paths)
- [The step-up state](#the-step-up-state)

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
