# Errors

This page covers `janusErrors()`: the plugin that answers every refusal
`@nxgt/janus` throws — a wrong password, a login taken, a store down —
with its status and a body a client can act on, typed on the routes after
it; and `bodyOf` and `statusOf`, the two functions it is made of.

```ts
import { alxia } from '@alxia/core';
import { janusErrors, sendSession } from '@alxia/janus';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';

const auth = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	password: { login: 'email', minLength: 12 },
	store: createMemoryStores(),
	hasher: scryptHasher(),
});

const SignUp = z.object({ email: z.string(), name: z.string(), password: z.string() });

const app = alxia()
	.use(janusErrors())
	.post('/signup', { body: SignUp }, async (ctx) => {
		const signedUp = await auth.signUp(ctx.body); // throws a JanusError when it refuses
		return ctx.reply(201, { id: sendSession(ctx, auth, signedUp).id });
	});
```

A route needs no `try`: `signUp` throws, and the plugin answers.

```text
400 {"code":"PASSWORD_TOO_SHORT","minLength":12}
400 {"code":"USER_INVALID","issues":[{"path":["email"],"message":"Invalid email address"}]}
409 {"code":"LOGIN_TAKEN"}
401 {"code":"CREDENTIALS_INVALID"}
401 {"code":"CREDENTIALS_INVALID","retryAfter":900}      + Retry-After: 900
503 {"code":"STORE_FAILED"}
```

## Where to put it

`janusErrors()` is an `onError` hook: it answers the errors of the routes
declared **after** it. Put it first. A `JanusError` thrown by a route
declared before it is the app's 500 `{"error":"internal"}`.

It answers only a `JanusError`. Anything else goes on to the app's next
`onError`, or its 500.

## Statuses

`statusOf(code)` is `@nxgt/janus`'s, re-exported:

| Status | Codes |
| --- | --- |
| 400 | `USER_INVALID`, `PASSWORD_TOO_SHORT`, `HASH_UNSUPPORTED`, `TOKEN_UNKNOWN`, `TOKEN_SPENT`, `TOKEN_EXPIRED`, `TOKEN_STALE`, `INVALID_CURSOR` |
| 401 | `CREDENTIALS_INVALID`, `CODE_INVALID` |
| 403 | `USER_INACTIVE`, `STEP_UP_REQUIRED` |
| 404 | `NOT_FOUND` |
| 409 | `LOGIN_TAKEN`, `VERSION_CONFLICT`, `SECOND_FACTOR_NOT_ENROLLED`, `SECOND_FACTOR_ACTIVE` |
| 500 | `PERMISSION_DEPTH` — a permission check walked past `maxDepth`: not a denial |
| 501 | `UNSUPPORTED` — a wiring mistake: a store lacks a method a flow needs |
| 503 | `STORE_FAILED` — **an outage, never a 401 or a 404** |

```ts
import { statusOf } from '@alxia/janus';

statusOf('STORE_FAILED'); // 503
statusOf('TOKEN_SPENT');  // 400
```

## Bodies

`bodyOf(error)` is the body: the `code`, and only what a client can act on.
**Never** the login, the `reason`, a hash prefix or a cause — those are for
your logs, and stay on the `JanusError`.

| Code | Body |
| --- | --- |
| `USER_INVALID` | `{ code, issues }` — `issues` is `[]` when the error carries none |
| `PASSWORD_TOO_SHORT` | `{ code, minLength? }` |
| `CODE_INVALID` | `{ code, attemptsLeft? }` |
| `CREDENTIALS_INVALID` | `{ code, retryAfter? }` — seconds; also sent as `Retry-After` |
| every other code | `{ code }` |

```ts
import { bodyOf } from '@alxia/janus';
import { NotFoundError } from '@nxgt/janus';

bodyOf(new NotFoundError('user')); // { code: 'NOT_FOUND' }
```

`CREDENTIALS_INVALID` is one code for an unknown login, a wrong password and
a login throttled for too many attempts: a client cannot tell a login exists
from it. `retryAfter` is set only once `janus()`'s throttle trips — ten
passwords in fifteen minutes by default — and the plugin then adds the
`Retry-After` header.

## Reporting the 5xx

```ts
const app = alxia().use(
	janusErrors({
		report: (error, ctx) => console.error(`${ctx.route}: ${error.code}`, error.cause),
	}),
);
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `report` | `(error: JanusError, ctx: BaseContext) => unknown` | none | called with every `JanusError` answered 500, 501 or 503 — `STORE_FAILED`, `UNSUPPORTED`, `PERMISSION_DEPTH` — the server's to fix |

`report` is called, not awaited: it cannot delay or change the answer. One
that throws or rejects is a process warning, and the 503 is sent all the
same:

```text
(node:13837) Warning: janusErrors(): report failed: Error: boom
```

The 4xx are not reported: they are the client's.

## On the client

The refusals are in the type of every route after the plugin, so
`@alxia/client` reads them. A 401 from a route behind
`session(auth, { required: true })` is either the session's
`{ error: 'unauthenticated' }` or janus's `{ code }`; narrow on the key:

```ts
import { client } from '@alxia/client';
import { alxia } from '@alxia/core';
import { janusErrors, session } from '@alxia/janus';

const app = alxia()
	.use(janusErrors())
	.use(session(auth, { required: true }))
	.get('/me', ({ user, reply }) => reply(200, { name: user.name }));

const me = await client(app).get('/me');
if (me.status === 401) {
	if ('error' in me.data) console.log('sign in first');   // the session's own 401
	else console.log(me.data.code);                           // a JanusErrorCode
}
if (me.status === 503) console.log(me.data.code);          // 'STORE_FAILED' and the like: try again later
```

## Signatures

```ts
function janusErrors(options?: JanusErrorsOptions): Alxia<Empty, Empty, '', Reply<JanusErrorStatus, JanusErrorBody>>;

interface JanusErrorsOptions {
	readonly report?: (error: JanusError, ctx: BaseContext) => unknown;
}

function bodyOf(error: JanusError): JanusErrorBody;

interface JanusErrorBody {
	readonly code: JanusErrorCode;
	readonly issues?: JanusError['issues'];
	readonly minLength?: number;
	readonly attemptsLeft?: number;
	readonly retryAfter?: number;
}

function statusOf(code: JanusErrorCode): JanusErrorStatus; // @nxgt/janus's
```

`JanusError`, `JanusErrorCode` and `JanusErrorStatus` are `@nxgt/janus`'s;
`Alxia`, `Empty`, `Reply` and `BaseContext` are `@alxia/core`'s.

The permission guard's own refusals — `{ error: 'forbidden' }` and the
like — are not `JanusError`s; see [Permissions](permissions.md#refusals).
